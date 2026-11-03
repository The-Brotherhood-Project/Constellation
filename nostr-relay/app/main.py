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
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import traceback

from .database import engine, Base, SessionLocal
from .api import router as api_router
from . import models, crud

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and seed protocol event kinds
    try:
        Base.metadata.create_all(bind=engine)
        print("Nostr Relay database tables created successfully.")
        db = SessionLocal()
        try:
            crud.seed_event_kinds(db)
            print("Protocol event kinds seeded successfully.")
        finally:
            db.close()
    except Exception as e:
        print(f"Database initialization failed: {e}")

    yield

app = FastAPI(title="The Brotherhood Nostr Relay Service", lifespan=lifespan)

# Add CORS middleware
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:10000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:10000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = f"Global Error: {exc}\n{traceback.format_exc()}"
    print(error_msg)
    with open("server_error.log", "a") as f:
        f.write(error_msg)
        f.write("-" * 80 + "\n")
        
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {exc}"},
    )

# Include api_router
app.include_router(api_router)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "brotherhood-nostr-relay"}
