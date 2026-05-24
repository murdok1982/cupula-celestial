"""threat-classifier — FastAPI app.

Consume `tracks.confirmed` desde Kafka, clasifica, publica `tracks.classified`.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

import structlog
from fastapi import FastAPI

from app.api import router
from app.inference import EnsembleClassifier
from app.models import TrackFeatures

try:
    from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
except ImportError:  # pragma: no cover
    AIOKafkaConsumer = None  # type: ignore[assignment]
    AIOKafkaProducer = None  # type: ignore[assignment]

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
structlog.configure(processors=[structlog.processors.JSONRenderer()])
log = structlog.get_logger("threat-classifier")

KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "redpanda:9092")
classifier = EnsembleClassifier()


async def _kafka_loop() -> None:
    if AIOKafkaConsumer is None:
        log.warning("aiokafka_missing")
        return
    consumer = AIOKafkaConsumer(
        "tracks.confirmed",
        bootstrap_servers=KAFKA_BROKERS,
        group_id="threat-classifier",
        auto_offset_reset="earliest",
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BROKERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        acks="all",
    )
    try:
        await consumer.start()
        await producer.start()
    except Exception as exc:  # noqa: BLE001
        log.warning("kafka_unavailable", error=str(exc))
        return
    log.info("kafka_loop_started")
    try:
        async for msg in consumer:
            try:
                feat = _features_from_track(msg.value)
                if feat is None:
                    continue
                result = classifier.classify(feat)
                # Reenvía track completo + classification para el decision-engine
                merged = {
                    **msg.value,
                    "classification": result.classification.value,
                    "confidence": result.confidence,
                    "ensemble_scores": result.ensemble_scores,
                    "reasons": result.reasons,
                }
                await producer.send_and_wait(
                    "tracks.classified", merged, key=feat.track_id.encode()
                )
                log.info(
                    "classified",
                    track_id=feat.track_id,
                    cls=result.classification.value,
                    confidence=round(result.confidence, 3),
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("classify_error", error=str(exc))
    finally:
        await consumer.stop()
        await producer.stop()


def _features_from_track(track: dict[str, Any]) -> TrackFeatures | None:
    try:
        ts = track.get("timestamp")
        if isinstance(ts, str):
            ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            ts_dt = datetime.utcnow()
        return TrackFeatures(
            track_id=track["track_id"],
            timestamp=ts_dt,
            speed_mps=float(track.get("speed_mps", 0.0)),
            altitude_agl_m=float(track.get("altitude_agl_m", 0.0)),
            rcs_dbsm=float(track.get("rcs_dbsm", -10.0)),
            doppler_mps=float(track.get("vz_mps", 0.0)),
            micro_doppler_period_ms=track.get("micro_doppler_period_ms"),
            spectrum_signature=track.get("spectrum_signature"),
            has_iff_response=bool(track.get("iff_status") == "FRIEND"),
            in_known_corridor=bool(track.get("in_known_corridor", False)),
            sensors=track.get("sensors_contributing", []),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("track_decode_failed", error=str(exc))
        return None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_kafka_loop())
    yield
    task.cancel()


app = FastAPI(title="Cúpula — threat-classifier", lifespan=lifespan)
app.include_router(router)
