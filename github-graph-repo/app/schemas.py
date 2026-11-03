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
