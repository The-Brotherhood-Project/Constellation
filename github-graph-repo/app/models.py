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
from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, ForeignKeyConstraint, DateTime, Date, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base

class Graph(Base):
    __tablename__ = "graph"

    uuid = Column(UUID, primary_key=True, default=text("gen_random_uuid()"))
    graph_name = Column(String, nullable=False)
    storage_url = Column(String, nullable=False)
    latest_version = Column(String, nullable=False)

    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    snapshots = relationship("Snapshot", back_populates="graph", foreign_keys="Snapshot.graph_uuid")
    latest_snapshot = relationship(
        "Snapshot", 
        primaryjoin="and_(Graph.latest_version == Snapshot.cid, Graph.uuid == Snapshot.graph_uuid)",
        viewonly=True
    )

class Snapshot(Base):
    __tablename__ = "snapshot"

    cid = Column(String, primary_key=True, nullable=False)
    graph_uuid = Column(UUID, ForeignKey("graph.uuid"), primary_key=True)
    # Version label specified inside the snapshot for bookkeeping
    version_label = Column(String, nullable=True)

    base_cid = Column(String, nullable=True)
    base_graph_uuid = Column(UUID, nullable=True)

    commit_sha = Column(String, nullable=False)
    branch = Column(String, nullable=False, server_default="main")
    has_children = Column(Boolean, nullable=False, server_default="False")

    created_at = Column(DateTime, nullable=False, default=func.now())

    graph = relationship("Graph", back_populates="snapshots", foreign_keys=[graph_uuid])

    __table_args__ = (
        # Explicit Composite Key FK to base snapshot
        ForeignKeyConstraint(
            ["base_cid", "base_graph_uuid"],
            ["snapshot.cid", "snapshot.graph_uuid"]
        ),
    )
