#
# Copyright (C) 2026 The Brotherhood Project Developers
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# SPDX-License-Identifier: AGPL-3.0-or-later
#
from fastapi import APIRouter, HTTPException, File, Form, Depends, UploadFile, Response
from typing import Annotated
import os
from uuid import UUID
from ... import services, schemas
from ...database import get_db
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/fetch/{cid}")
async def get_snapshot(
    cid: str,
    db: Session = Depends(get_db)
):
    """Fetch a snapshot by CID from github, convert to knw format"""
    try:
        name, content = services.fetch_snapshot(db, cid, as_knw=True)
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={name}.knw"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch snapshot: {e}")

@router.get("/fetch/{cid}/json")
async def get_snapshot_json(
    cid: str,
    db: Session = Depends(get_db)
):
    """Fetch a snapshot by CID from github"""
    try:
        name, content = services.fetch_snapshot(db, cid, as_knw=False)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={name}.json"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch snapshot: {e}")

@router.post("/add/graph")
async def add_graph(
    file: Annotated[UploadFile, File(description="The data of the first version of the graph in .knw format")],
    graph_metadata: Annotated[schemas.GraphCreate, Depends()],
    db: Session = Depends(get_db)
):
    """Add a new graph to the database"""
    try:
        file_bytes = await file.read()
        return services.add_graph(db, graph_metadata, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add graph: {e}")

@router.post("/add/snapshot/{graph_uuid}")
async def add_version(
    file: Annotated[UploadFile, File(description="The data of the version in .knw format")],
    snapshot_metadata: Annotated[schemas.SnapshotCreate, Depends()],
    db: Session = Depends(get_db)
):
    """Add a new version to a graph"""
    try:
        file_bytes = await file.read()
        return services.add_snapshot(db, snapshot_metadata, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add snapshot: {e}")

@router.get("/metadata")
def get_service_metadata():
    service_name = os.getenv("SERVICE_NAME") or ""
    service_desc = os.getenv("SERVICE_DESC") or ""
    service_did = os.getenv("SERVICE_DID") or ""
    copyright_notice = os.getenv("COPYRIGHT_NOTICE") or ""
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
