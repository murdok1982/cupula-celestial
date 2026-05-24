"""Routers FastAPI."""
from __future__ import annotations

from fastapi import APIRouter

from app.inference import EnsembleClassifier
from app.models import ClassificationResult, TrackFeatures

router = APIRouter()
_classifier = EnsembleClassifier()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "threat-classifier"}


@router.post("/v1/classify", response_model=ClassificationResult)
async def classify(features: TrackFeatures) -> ClassificationResult:
    return _classifier.classify(features)


@router.post("/v1/classify_batch", response_model=list[ClassificationResult])
async def classify_batch(features: list[TrackFeatures]) -> list[ClassificationResult]:
    return [_classifier.classify(f) for f in features]
