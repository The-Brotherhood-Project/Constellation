from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import traceback

from .database import engine, Base
from .api import router

# Import models for database table creation
from . import models, nostr_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Simple database initialization
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables created successfully")
    except Exception as e:
        print(f"Database initialization failed: {e}")

    # Renew Kind 0 Manifest event upon startup to notify nostr relays
    try:
        nostr_service.renew_manifest()
    except Exception as e:
        print(f"Failed to renew manifest on startup: {e}")

    yield


app = FastAPI(title="The Brotherhood GitHub Graph Repo Service", lifespan=lifespan)

# Add CORS middleware for development
print("Adding CORS middleware...")
# Dynamic CORS configuration for both local and production
allowed_origins = ["*"]

secure_headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
    "Pragma": "no-cache",
    "Expires": "0"
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
print("CORS middleware added successfully!")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = f"Global Error: {exc}\n{traceback.format_exc()}"
    print(error_msg)
    with open("server_error.log", "a") as f:
        f.write(f"Timestamp: {os.times()}\n")
        f.write(error_msg)
        f.write("-" * 80 + "\n")
        
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )

# Add the router
app.include_router(router, prefix="/api")

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for testing and monitoring"""
    return {"status": "healthy", "service": "brotherhood-github-graph-repo"}

