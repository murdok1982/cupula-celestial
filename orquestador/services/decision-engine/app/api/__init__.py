"""Endpoints HTTP."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import RecommendRequest, Recommendation
from app.recommender import Recommender

router = APIRouter()
_recommender = Recommender()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "decision-engine"}


@router.post("/v1/recommend", response_model=Recommendation)
async def recommend(req: RecommendRequest) -> Recommendation:
    try:
        return await _recommender.run(req)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
