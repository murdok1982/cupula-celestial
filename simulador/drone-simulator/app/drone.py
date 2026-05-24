"""Modelo simple de un dron interceptor que responde a comandos MAVLink."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DroneState:
    sys_id: int
    callsign: str
    lat: float
    lon: float
    alt_m: float
    status: str = "READY"
    last_command_seq: int = -1


def apply_waypoint(d: DroneState, lat: float, lon: float, alt: float) -> None:
    d.lat = lat
    d.lon = lon
    d.alt_m = alt
    d.status = "ENROUTE"


def apply_abort(d: DroneState) -> None:
    d.status = "ABORTED"
