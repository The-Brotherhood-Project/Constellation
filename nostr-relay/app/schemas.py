"""
Contains all the protocol schemas and validations for API
"""
from pydantic import BaseModel, Field
from typing import Annotated, Literal, Optional, Any, Union

PROTOCOL_NUMBER = 27000

# The following schemas are for illustrative purposes only, they are not used in the application
# This establishes the standard protocol, but the relay accepts arbitrary tags
class MetadataTag(BaseModel):
    kind: Literal[0] = Field(0, description="The type of the tag, must be 0 for client")
    did: str = Field(..., description="Public DID of the client")
    url: str = Field(..., description="The full URL where this client can be found, required")

    name: Optional[str] = Field(None, description="The name of the client")
    sub_type: Optional[Literal["c", "s", "r"]] = Field(None, description="The sub-type of the client, one of 'c' (client), 's' (server) or 'r' (relay)")
    loc: Optional[str] = Field(None, description="The location of the client")

class ResourceTag(BaseModel):
    kind: Literal[1] = Field(1, description="The type of the tag, must be 1 for resource")
    did: str = Field(..., description="Public DID of the resource")
    available: bool = Field(..., description="Whether the resource is available")
    endpoint: str = Field(..., description="The endpoint where this resource can be found")

    sub_type: Optional[Literal["g", "r", "c", "x"]] = Field(None, description="The sub-type of the resource, one of 'g' (graph), 'r' (resource), 'c' (capability) or 'x' (other)")
    file_type: Optional[str] = Field(None, description="The file type of the resource")

class ProjectTag(BaseModel):
    kind: Literal[2] = Field(2, description="The type of the tag, must be 2 for project")
    did: str = Field(..., description="Public DID of the project")
    endpoint: str = Field(..., description="The endpoint where information about this project can be found")
    sub_type: Optional[str] = Field(None, description="The sub-type of the project")

# This is a "nostr-like" event schema that uses slightly different key names, no content, dict tags, and ed25519 signatures
class NostrEvent(BaseModel):
    id: str = Field(..., description="32-bytes lowercase hex-encoded sha256 of the serialized event data")
    kind: int = Field(..., description=f"The kind of the event")
    did: str = Field(..., description="Public DID of the event creator")
    created_at: int = Field(..., description="Unix timestamp of event creation")
    tags: dict[str, str] = Field(..., description="The tags of the event as a generic dict")
    sig: str = Field(..., description="64-bytes lowercase hex of the ed25519 signature of the event id")

class EventQuery(BaseModel):
    kinds: Optional[list[int]] = Field(None, description="List of event kinds to filter by")
    dids: Optional[list[str]] = Field(None, description="List of creator DIDs to filter by")
    tags: Optional[dict[str, str]] = Field(None, description="Dictionary of key/value tags to match")
    since: Optional[int] = Field(None, description="Filter events created at or after this timestamp")
    until: Optional[int] = Field(None, description="Filter events created at or before this timestamp")
    limit: Optional[int] = Field(100, description="Maximum number of events to return")

class EventKindSchema(BaseModel):
    kind: int
    name: Optional[str] = None
    description: Optional[str] = None
