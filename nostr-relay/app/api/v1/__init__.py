from fastapi import APIRouter
from .api import router as api_router

router = APIRouter(prefix="/v1")
router.include_router(api_router)
