"""decision-engine FastAPI app + Kafka loop."""
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
from app.models import ContextInput, RecommendRequest, TrackInput
from app.recommender import Recommender

try:
    from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
except ImportError:  # pragma: no cover
    AIOKafkaConsumer = None  # type: ignore[assignment]
    AIOKafkaProducer = None  # type: ignore[assignment]

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
structlog.configure(processors=[structlog.processors.JSONRenderer()])
log = structlog.get_logger("decision-engine")

KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "redpanda:9092")
recommender = Recommender()


def _classified_to_request(track: dict[str, Any]) -> RecommendRequest | None:
    try:
        # tracks.classified pasa por threat-classifier, que incluye 'classification' y 'confidence'.
        # Para acceder a posición y otros campos del track, traemos lo embebido si está.
        # En PoC asumimos que el threat-classifier reenvía los campos básicos.
        return RecommendRequest(
            track=TrackInput(
                track_id=track["track_id"],
                classification=track.get("classification", "UNKNOWN"),
                confidence=float(track.get("confidence", 0.0)),
                latitude=float(track.get("latitude", 40.4168)),
                longitude=float(track.get("longitude", -3.7038)),
                altitude_agl_m=float(track.get("altitude_agl_m", 200.0)),
                speed_mps=float(track.get("speed_mps", 50.0)),
                tti_seconds=float(track.get("tti_seconds", 30.0)),
                iff_status=track.get("iff_status", "UNKNOWN"),
            ),
            context=ContextInput(
                alert_level=track.get("alert_level", "AMBER"),
                civilians_within_500m=bool(track.get("civilians_within_500m", False)),
                in_protected_zone=bool(track.get("in_protected_zone", False)),
                available_interceptors=track.get("available_interceptors", ["I-01", "I-02", "I-03"]),
            ),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("track_decode_failed", error=str(exc))
        return None


async def _kafka_loop() -> None:
    if AIOKafkaConsumer is None:
        log.warning("aiokafka_missing")
        return
    consumer = AIOKafkaConsumer(
        "tracks.classified",
        bootstrap_servers=KAFKA_BROKERS,
        group_id="decision-engine",
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
            req = _classified_to_request(msg.value)
            if req is None:
                continue
            try:
                rec = await recommender.run(req)
                await producer.send_and_wait(
                    "recommendations",
                    rec.model_dump(mode="json"),
                    key=req.track.track_id.encode(),
                )
                log.info(
                    "recommended",
                    track_id=req.track.track_id,
                    rec=rec.recommendation.value,
                    pk=round(rec.pk_estimated, 3),
                    auth=rec.authorization_level.value,
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("recommend_error", error=str(exc), track=req.track.track_id)
    finally:
        await consumer.stop()
        await producer.stop()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_kafka_loop())
    yield
    task.cancel()
    await recommender.close()
    if not task.done():
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Cúpula — decision-engine", lifespan=lifespan)
app.include_router(router)
