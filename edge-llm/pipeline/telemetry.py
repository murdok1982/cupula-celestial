"""Telemetría hacia el swarm-controller vía MAVLink2 (UDP).

Envia un STATUSTEXT con un JSON resumido del resultado del pipeline. PoC:
suficiente para que el orquestador correlacione frames con engagements.
"""
from __future__ import annotations

import json
import logging
import os
import struct
from typing import Any

log = logging.getLogger("edge-llm.telemetry")

try:
    from pymavlink import mavutil
except Exception:  # noqa: BLE001
    mavutil = None  # type: ignore[assignment]


class MavlinkTelemetry:
    def __init__(self, target: str | None = None, sys_id: int = 1) -> None:
        self.target = target or os.environ.get("SWARM_CONTROLLER_MAVLINK", "udpout:swarm-controller:14550")
        self.sys_id = sys_id
        self.conn = None
        if mavutil is None:
            log.warning("pymavlink_missing; telemetry will be no-op")
            return
        try:
            self.conn = mavutil.mavlink_connection(self.target, source_system=sys_id)
            log.info("telemetry_link_up url=%s", self.target)
        except Exception as exc:  # noqa: BLE001
            log.warning("telemetry_link_failed %s; no-op", exc)

    def send_result(self, vlm_output: dict[str, Any]) -> None:
        if self.conn is None:
            return
        text = json.dumps(vlm_output)[:200]
        try:
            # STATUSTEXT severity 6 = INFO
            self.conn.mav.statustext_send(6, text.encode("utf-8")[:50])
        except Exception as exc:  # noqa: BLE001
            log.warning("telemetry_send_failed %s", exc)
