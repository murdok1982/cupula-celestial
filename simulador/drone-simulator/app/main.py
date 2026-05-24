"""drone-simulator: escucha MAVLink2 sobre UDP y simula respuesta de enjambre."""
from __future__ import annotations

import logging
import os
import socket
import threading
import time

import structlog
from pymavlink import mavutil

from app.drone import DroneState, apply_abort, apply_waypoint

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
structlog.configure(processors=[structlog.processors.JSONRenderer()])
log = structlog.get_logger("drone-simulator")

BIND = os.environ.get("MAVLINK_BIND", "0.0.0.0:14550")
DRONE_COUNT = int(os.environ.get("DRONE_COUNT", "6"))


def build_swarm(n: int) -> dict[int, DroneState]:
    return {
        i + 1: DroneState(
            sys_id=i + 1,
            callsign=f"I-{i + 1:02d}",
            lat=40.416 + i * 0.001,
            lon=-3.704 + i * 0.001,
            alt_m=20.0,
            status="READY",
        )
        for i in range(n)
    }


def telemetry_loop(swarm: dict[int, DroneState]) -> None:
    """Imprime telemetría cada 2 s."""
    while True:
        for sys_id, d in swarm.items():
            log.info(
                "telemetry",
                sys_id=sys_id,
                callsign=d.callsign,
                lat=round(d.lat, 5),
                lon=round(d.lon, 5),
                alt_m=round(d.alt_m, 1),
                status=d.status,
            )
        time.sleep(5.0)


def main() -> None:
    swarm = build_swarm(DRONE_COUNT)
    threading.Thread(target=telemetry_loop, args=(swarm,), daemon=True).start()

    host, port = BIND.split(":")
    url = f"udpin:{host}:{port}"
    log.info("mavlink_listen", url=url, drones=len(swarm))
    try:
        conn = mavutil.mavlink_connection(url, dialect="common")
    except (OSError, socket.error) as exc:
        log.error("mavlink_listen_failed", error=str(exc))
        # Mantener proceso vivo
        while True:
            time.sleep(60)

    while True:
        try:
            msg = conn.recv_match(blocking=True, timeout=5)
        except (OSError, socket.error) as exc:
            log.warning("mavlink_recv_error", error=str(exc))
            continue
        if msg is None:
            continue
        mtype = msg.get_type()
        if mtype == "MISSION_ITEM_INT":
            sys_id = getattr(msg, "target_system", 1)
            if sys_id in swarm:
                lat = msg.x / 1e7
                lon = msg.y / 1e7
                alt = float(msg.z)
                apply_waypoint(swarm[sys_id], lat, lon, alt)
                log.info(
                    "waypoint_accepted",
                    sys_id=sys_id,
                    callsign=swarm[sys_id].callsign,
                    lat=lat,
                    lon=lon,
                    alt=alt,
                )
        elif mtype == "COMMAND_LONG" and getattr(msg, "command", 0) == 185:  # FLIGHTTERMINATION
            sys_id = getattr(msg, "target_system", 1)
            if sys_id in swarm:
                apply_abort(swarm[sys_id])
                log.info("abort_accepted", sys_id=sys_id, callsign=swarm[sys_id].callsign)
        else:
            log.debug("mavlink_msg_ignored", mtype=mtype)


if __name__ == "__main__":
    main()
