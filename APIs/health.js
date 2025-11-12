from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    ok: bool


@router.get("/health-check")
def health_check() -> HealthResponse:
    return HealthResponse(ok=True)
