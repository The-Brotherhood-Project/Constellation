from sqlalchemy import Column, Integer, BigInteger, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from .database import Base

class EventKind(Base):
    __tablename__ = "event_kinds"

    kind = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=func.now())

    events = relationship("Event", back_populates="event_kind")

class Event(Base):
    __tablename__ = "events"

    id = Column(String(64), primary_key=True, index=True)
    kind = Column(Integer, ForeignKey("event_kinds.kind"), nullable=False, index=True)
    did = Column(String, nullable=False, index=True)
    created_at = Column(BigInteger, nullable=False, index=True)
    sig = Column(String(128), nullable=False)
    received_at = Column(DateTime, nullable=False, default=func.now())

    event_kind = relationship("EventKind", back_populates="events")
    tags = relationship("Tag", back_populates="event", cascade="all, delete-orphan")

class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(64), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String, nullable=False, index=True)
    value = Column(String, nullable=False, index=True)

    event = relationship("Event", back_populates="tags")
