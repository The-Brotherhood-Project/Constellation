"""initial schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-09-05 16:21:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'event_kinds',
        sa.Column('kind', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_event_kinds_kind'), 'event_kinds', ['kind'], unique=False)

    op.create_table(
        'events',
        sa.Column('id', sa.String(length=64), nullable=False, primary_key=True),
        sa.Column('kind', sa.Integer(), sa.ForeignKey('event_kinds.kind'), nullable=False),
        sa.Column('did', sa.String(), nullable=False),
        sa.Column('created_at', sa.BigInteger(), nullable=False),
        sa.Column('sig', sa.String(length=128), nullable=False),
        sa.Column('received_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_events_id'), 'events', ['id'], unique=False)
    op.create_index(op.f('ix_events_kind'), 'events', ['kind'], unique=False)
    op.create_index(op.f('ix_events_did'), 'events', ['did'], unique=False)
    op.create_index(op.f('ix_events_created_at'), 'events', ['created_at'], unique=False)

    op.create_table(
        'tags',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False, primary_key=True),
        sa.Column('event_id', sa.String(length=64), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.String(), nullable=False),
    )
    op.create_index(op.f('ix_tags_event_id'), 'tags', ['event_id'], unique=False)
    op.create_index(op.f('ix_tags_key'), 'tags', ['key'], unique=False)
    op.create_index(op.f('ix_tags_value'), 'tags', ['value'], unique=False)

def downgrade() -> None:
    op.drop_table('tags')
    op.drop_table('events')
    op.drop_table('event_kinds')
