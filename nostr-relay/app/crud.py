import json
import base64
import hashlib
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.exceptions import InvalidSignature

from . import models, schemas

def calculate_event_id(did: str, created_at: int, kind: int, tags: dict) -> str:
    """Calculate canonical sha256 event ID"""
    serialized = json.dumps([0, did, created_at, kind, tags], separators=(',', ':'), sort_keys=True)
    return hashlib.sha256(serialized.encode('utf-8')).hexdigest()

def extract_pubkey_from_did(did: str) -> ed25519.Ed25519PublicKey:
    """Extract Ed25519 public key from did:jwk"""
    if not did.startswith("did:jwk:"):
        raise ValueError("DID must start with did:jwk:")
    
    b64_jwk = did[len("did:jwk:"):]
    # Fix base64url padding
    b64_jwk_padded = b64_jwk + '=' * (-len(b64_jwk) % 4)
    jwk_bytes = base64.urlsafe_b64decode(b64_jwk_padded)
    jwk = json.loads(jwk_bytes.decode('utf-8'))

    if jwk.get("crv") != "Ed25519" or "x" not in jwk:
        raise ValueError("JWK must be Ed25519 curve with 'x' coordinate")

    x_b64 = jwk["x"]
    x_b64_padded = x_b64 + '=' * (-len(x_b64) % 4)
    raw_pubkey = base64.urlsafe_b64decode(x_b64_padded)

    return ed25519.Ed25519PublicKey.from_public_bytes(raw_pubkey)

def verify_event_signature(event: schemas.NostrEvent) -> bool:
    """Verify event ID and ed25519 signature"""
    # 1. Verify Event ID matches canonical hash
    expected_id = calculate_event_id(event.did, event.created_at, event.kind, event.tags)
    if event.id != expected_id:
        print(f"Event ID mismatch: expected {expected_id}, got {event.id}")
        return False

    # 2. Extract public key and verify signature
    try:
        pub_key = extract_pubkey_from_did(event.did)
        sig_bytes = bytes.fromhex(event.sig)
        # Verify signature over event.id string or bytes
        try:
            pub_key.verify(sig_bytes, event.id.encode('utf-8'))
        except InvalidSignature:
            pub_key.verify(sig_bytes, bytes.fromhex(event.id))
        return True
    except Exception as e:
        print(f"Signature verification error: {e}")
        return False

def seed_event_kinds(db: Session):
    """Seed protocol kinds 27000, 27001, 27002 if they do not exist"""
    protocol_kinds = [
        (schemas.PROTOCOL_NUMBER, "Metadata / Manifest", "Client or node metadata and manifest event (replaceable)"),
        (schemas.PROTOCOL_NUMBER + 1, "Resource Availability", "Resource availability event (replaceable)"),
        (schemas.PROTOCOL_NUMBER + 2, "Project Updates", "Project updates and notification event (non-replaceable)")
    ]

    for kind_num, name, desc in protocol_kinds:
        existing = db.query(models.EventKind).filter(models.EventKind.kind == kind_num).first()
        if not existing:
            db_kind = models.EventKind(kind=kind_num, name=name, description=desc)
            db.add(db_kind)
    db.commit()

def save_event(db: Session, event: schemas.NostrEvent) -> models.Event:
    """
    Validate, handle replaceability for kinds 0 & 1, and save event with tags.
    """
    # 1. Verify signature
    if not verify_event_signature(event):
        raise HTTPException(status_code=400, detail="Invalid event signature or event ID mismatch")

    # 2. Verify kind exists in event_kinds
    db_kind = db.query(models.EventKind).filter(models.EventKind.kind == event.kind).first()
    if not db_kind:
        raise HTTPException(status_code=400, detail=f"Unregistered event kind: {event.kind}")

    # 3. Handle replaceability for Kind 0 (27000) and Kind 1 (27001)
    if event.kind == schemas.PROTOCOL_NUMBER:
        # Kind 0: Replaceable per creator DID
        existing = db.query(models.Event).filter(
            models.Event.kind == event.kind,
            models.Event.did == event.did
        ).first()
        if existing:
            if existing.created_at >= event.created_at:
                return existing
            db.delete(existing)
            db.flush()

    elif event.kind == schemas.PROTOCOL_NUMBER + 1:
        # Kind 1: Replaceable per creator DID and resource tag (did or url)
        resource_id = event.tags.get("did") or event.tags.get("url")
        existing_events = db.query(models.Event).filter(
            models.Event.kind == event.kind,
            models.Event.did == event.did
        ).all()
        for existing in existing_events:
            existing_res = next((t.value for t in existing.tags if t.key in ("did", "url")), None)
            if existing_res == resource_id or not resource_id:
                if existing.created_at >= event.created_at:
                    return existing
                db.delete(existing)
                db.flush()

    # Kind 2 (27002): Non-replaceable (append-only), do not delete existing events.

    # 4. Insert Event record
    db_event = models.Event(
        id=event.id,
        kind=event.kind,
        did=event.did,
        created_at=event.created_at,
        sig=event.sig
    )
    db.add(db_event)
    db.flush()

    # 5. Insert Tag records (dict tags key/value pairs)
    for key, value in event.tags.items():
        tag_record = models.Tag(
            event_id=event.id,
            key=key,
            value=str(value)
        )
        db.add(tag_record)

    db.commit()
    db.refresh(db_event)
    return db_event

def query_events(db: Session, filter: schemas.EventQuery) -> List[models.Event]:
    """Query events with agnostic tag and kind filtering"""
    query = db.query(models.Event)

    if filter.kinds:
        query = query.filter(models.Event.kind.in_(filter.kinds))

    if filter.dids:
        query = query.filter(models.Event.did.in_(filter.dids))

    if filter.since is not None:
        query = query.filter(models.Event.created_at >= filter.since)

    if filter.until is not None:
        query = query.filter(models.Event.created_at <= filter.until)

    if filter.tags:
        for k, v in filter.tags.items():
            query = query.filter(models.Event.tags.any(
                and_(models.Tag.key == k, models.Tag.value == str(v))
            ))

    query = query.order_by(models.Event.created_at.desc())
    if filter.limit:
        query = query.limit(filter.limit)

    return query.all()

def event_to_schema(db_event: models.Event) -> schemas.NostrEvent:
    """Convert database Event model to NostrEvent Pydantic schema"""
    tags_dict = {tag.key: tag.value for tag in db_event.tags}
    return schemas.NostrEvent(
        id=db_event.id,
        kind=db_event.kind,
        did=db_event.did,
        created_at=db_event.created_at,
        tags=tags_dict,
        sig=db_event.sig
    )
