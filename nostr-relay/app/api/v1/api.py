from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from ...database import get_db
from ... import schemas, crud, models

router = APIRouter()

@router.post("/events", response_model=schemas.NostrEvent)
def publish_event(event: schemas.NostrEvent, db: Session = Depends(get_db)):
    """Publish a new Nostr event to the relay"""
    try:
        db_event = crud.save_event(db, event)
        return crud.event_to_schema(db_event)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to publish event: {e}")

@router.post("/events/query", response_model=List[schemas.NostrEvent])
def query_events_post(filter: schemas.EventQuery, db: Session = Depends(get_db)):
    """Query events using structured JSON filters"""
    try:
        db_events = crud.query_events(db, filter)
        return [crud.event_to_schema(e) for e in db_events]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query events: {e}")

@router.get("/events", response_model=List[schemas.NostrEvent])
def query_events_get(
    kind: Optional[List[int]] = Query(None),
    did: Optional[List[str]] = Query(None),
    since: Optional[int] = Query(None),
    until: Optional[int] = Query(None),
    limit: Optional[int] = Query(100),
    db: Session = Depends(get_db)
):
    """Query events using URL query parameters"""
    try:
        filter = schemas.EventQuery(
            kinds=kind,
            dids=did,
            since=since,
            until=until,
            limit=limit
        )
        db_events = crud.query_events(db, filter)
        return [crud.event_to_schema(e) for e in db_events]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query events: {e}")

@router.get("/kinds", response_model=List[schemas.EventKindSchema])
def list_event_kinds(db: Session = Depends(get_db)):
    """List registered event kinds"""
    kinds = db.query(models.EventKind).all()
    return [schemas.EventKindSchema(kind=k.kind, name=k.name, description=k.description) for k in kinds]

@router.get("/metadata")
def get_service_metadata():
    service_name = os.getenv("SERVICE_NAME") or ""
    service_desc = os.getenv("SERVICE_DESC") or ""
    copyright_notice = os.getenv("COPYRIGHT_NOTICE") or ""
    service_did = os.getenv("SERVICE_DID") or ""
    if os.path.exists("LICENSE.txt"):
        with open("LICENSE.txt", "r", encoding="utf-8") as f:
            license = f.read()
    else:
        license = ""
    latest_api_version = os.getenv("LATEST_API_VERSION") or ""
    public_repo_url = os.getenv("PUBLIC_REPO_URL") or ""

    return {
        "service_name": service_name,
        "service_desc": service_desc,
        "service_did": service_did,
        "copyright_notice": copyright_notice,
        "license": license,
        "latest_api_version": latest_api_version,
        "public_repo_url": public_repo_url
    }
