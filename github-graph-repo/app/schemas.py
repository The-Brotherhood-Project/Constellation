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
"""
All the schemas for the API
"""
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional

class GraphCreate(BaseModel):
    graph_name: str = Field(..., description="The name of the graph")
    requestor_did: str = Field(..., description="The DID of the requestor, the permission token for the usage of the storage space will be issued to this DID")

class SnapshotCreate(BaseModel):
    graph_uuid: UUID = Field(..., description="The UUID of the graph whose version/snapshot this is")
    base_cid: str = Field(..., description="The base snapshot of this graph on which this current one is built. This is requied. If you want to make a version without an explicit base_cid, create a new graph or make a fork")

    token: str = Field(..., description="The authorisation token for the creation of this snapshot")
