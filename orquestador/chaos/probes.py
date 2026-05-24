"""Verification probes for Chaos Engineering experiments."""

from __future__ import annotations

import json
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("chaos.probes")


@dataclass
class ProbeResult:
    name: str
    passed: bool
    measured_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    details: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class BaseProbe(ABC):
    @abstractmethod
    def run(self) -> ProbeResult: ...


class HealthProbe(BaseProbe):
    def __init__(self, prometheus_url: str = "http://prometheus:9090") -> None:
        self.prometheus_url = prometheus_url
        self.name = "health_check"

    def run(self) -> ProbeResult:
        import httpx

        services = {
            "sensor-ingest": 9000,
            "track-fusion": 9100,
            "hmi-gateway": 8080,
            "audit-log": 9300,
            "threat-classifier": 8001,
            "decision-engine": 8002,
            "policy-engine": 8181,
        }
        statuses: dict[str, Any] = {}
        all_healthy = True

        for name, port in services.items():
            try:
                resp = httpx.get(
                    f"http://{name}:{port}/health",
                    timeout=5.0,
                    verify=False,
                )
                healthy = resp.status_code < 500
                statuses[name] = {
                    "status_code": resp.status_code,
                    "healthy": healthy,
                    "body": resp.text[:200],
                }
                if not healthy:
                    all_healthy = False
                    log.warning("health_fail", service=name, status=resp.status_code)
            except Exception as exc:
                statuses[name] = {"healthy": False, "error": str(exc)}
                all_healthy = False
                log.warning("health_error", service=name, error=str(exc))

        return ProbeResult(
            name=self.name,
            passed=all_healthy,
            details={"services": statuses, "all_healthy": all_healthy},
        )


class PipelineProbe(BaseProbe):
    def __init__(self) -> None:
        self.name = "pipeline_integrity"

    def run(self) -> ProbeResult:
        import httpx

        payload = {
            "track_id": "CHAOS-PROBE-T00",
            "classification": "HOSTILE",
            "confidence": 0.85,
            "latitude": 40.42,
            "longitude": -3.70,
            "altitude_agl_m": 300.0,
            "speed_mps": 60.0,
            "tti_seconds": 25.0,
            "iff_status": "UNKNOWN",
        }
        context = {
            "alert_level": "RED",
            "civilians_within_500m": False,
            "in_protected_zone": False,
            "available_interceptors": ["I-01", "I-02"],
        }
        try:
            resp = httpx.post(
                "http://decision-engine:8002/v1/recommend",
                json={"track": payload, "context": context},
                timeout=15.0,
                verify=False,
            )
            if resp.status_code != 200:
                return ProbeResult(
                    name=self.name,
                    passed=False,
                    details={
                        "status_code": resp.status_code,
                        "body": resp.text[:300],
                    },
                    error="decision-engine rechazó recomendación",
                )
            data = resp.json()
            has_recommendation = "recommendation" in data
            return ProbeResult(
                name=self.name,
                passed=has_recommendation,
                details={"response": data, "has_recommendation": has_recommendation},
            )
        except Exception as exc:
            return ProbeResult(
                name=self.name,
                passed=False,
                error=str(exc),
                details={"exception": str(exc)},
            )


class LatencyProbe(BaseProbe):
    def __init__(self, prometheus_url: str = "http://prometheus:9090") -> None:
        self.prometheus_url = prometheus_url
        self.name = "latency_metrics"

    def run(self) -> ProbeResult:
        import httpx

        query_p50 = 'histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, service))'
        query_p95 = 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, service))'
        query_p99 = 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, service))'

        latencies: dict[str, dict[str, float]] = {}
        passed = True

        for label, query in [("p50", query_p50), ("p95", query_p95), ("p99", query_p99)]:
            try:
                resp = httpx.get(
                    f"{self.prometheus_url}/api/v1/query",
                    params={"query": query},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("data", {}).get("result", [])
                    for item in results:
                        svc = item.get("metric", {}).get("service", "unknown")
                        val = float(item.get("value", [0, "0"])[1])
                        latencies.setdefault(svc, {})[label] = val
            except Exception as exc:
                log.warning("prometheus_query_error", query=label, error=str(exc))
                passed = False

        return ProbeResult(
            name=self.name,
            passed=passed,
            details={"latencies": latencies},
        )


class IntegrityProbe(BaseProbe):
    def __init__(self, audit_log_url: str = "http://audit-log:9300") -> None:
        self.audit_log_url = audit_log_url
        self.name = "audit_integrity"

    def run(self) -> ProbeResult:
        import httpx

        try:
            resp = httpx.get(
                f"{self.audit_log_url}/v1/verify_chain",
                timeout=10.0,
                verify=False,
            )
            if resp.status_code != 200:
                return ProbeResult(
                    name=self.name,
                    passed=False,
                    error=f"audit-log status {resp.status_code}",
                    details={"status_code": resp.status_code},
                )
            data = resp.json()
            chain_valid = data.get("valid", False)
            total_events = data.get("total_events", 0)
            return ProbeResult(
                name=self.name,
                passed=chain_valid,
                details={
                    "valid": chain_valid,
                    "total_events": total_events,
                    "total_batches": data.get("total_batches", 0),
                    "invalid_batches": data.get("invalid_batches", []),
                },
            )
        except Exception as exc:
            return ProbeResult(
                name=self.name,
                passed=False,
                error=str(exc),
                details={"exception": str(exc)},
            )


PROBE_REGISTRY: dict[str, type[BaseProbe]] = {
    "health": HealthProbe,
    "pipeline": PipelineProbe,
    "latency": LatencyProbe,
    "integrity": IntegrityProbe,
}


def run_all_probes(prometheus_url: str = "http://prometheus:9090") -> dict[str, ProbeResult]:
    results: dict[str, ProbeResult] = {}
    probes: list[BaseProbe] = [
        HealthProbe(prometheus_url=prometheus_url),
        PipelineProbe(),
        IntegrityProbe(),
    ]
    for probe in probes:
        try:
            results[probe.name] = probe.run()
        except Exception as exc:
            log.exception("probe_error", name=probe.name, error=str(exc))
            results[probe.name] = ProbeResult(
                name=probe.name,
                passed=False,
                error=str(exc),
            )
    return results
