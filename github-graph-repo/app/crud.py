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
from sqlalchemy.orm import Session
from uuid import UUID
from . import models

def add_graph(db: Session, **kwargs) -> models.Graph:
    graph = models.Graph(**kwargs)
    db.add(graph)
    db.commit()
    db.refresh(graph)
    return graph

def get_graph(db: Session, uuid: UUID) -> models.Graph | None:
    return db.query(models.Graph).filter(models.Graph.uuid == uuid).first()

def get_snapshot(db: Session, cid: str) -> models.Snapshot | None:
    return db.query(models.Snapshot).filter(models.Snapshot.cid == cid).first()

def get_latest_snapshot(db: Session, graph_uuid: UUID) -> models.Snapshot | None:
    graph = db.query(models.Graph).filter(models.Graph.uuid == graph_uuid).first()
    if not graph or not graph.latest_version:
        return None
    return get_snapshot(db, graph.latest_version)

def add_snapshot(db: Session, **kwargs) -> models.Snapshot:
    snapshot = models.Snapshot(**kwargs)
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot

def update_snapshot(db: Session, snapshot_cid: str, **kwargs):
    snapshot = db.query(models.Snapshot).filter(
        models.Snapshot.cid == snapshot_cid
    ).update(kwargs)
    db.flush()
    return snapshot
    