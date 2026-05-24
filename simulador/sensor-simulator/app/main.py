"""sensor-simulator: emite detecciones contra sensor-ingest."""
from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from typing import Optional

import httpx
import structlog
import typer

from app import eo_ir_sim, radar_sim, rf_sim
from app.scenarios import Scenario, get as get_scenario

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
structlog.configure(processors=[structlog.processors.JSONRenderer()])
log = structlog.get_logger("sensor-simulator")

SENSOR_INGEST_URL = os.environ.get("SENSOR_INGEST_URL", "http://sensor-ingest:9000")

cli = typer.Typer()


async def send_with_retry(client: httpx.AsyncClient, payload: dict, max_retries: int = 3) -> bool:
    for attempt in range(max_retries):
        try:
            r = await client.post(
                f"{SENSOR_INGEST_URL}/v1/sensors/reading",
                json=payload,
                timeout=3.0,
            )
            if r.status_code < 400:
                return True
            log.warning("ingest_reject", status=r.status_code, body=r.text[:200])
            return False
        except httpx.HTTPError as exc:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                log.warning("ingest_retry", attempt=attempt, wait=wait, error=str(exc))
                await asyncio.sleep(wait)
            else:
                log.warning("ingest_failed_degraded", error=str(exc), payload_type=payload.get("sensor_type"))
    return False


async def run_single(scenario: Scenario, client: httpx.AsyncClient, duration_s: int = 0) -> None:
    duration = duration_s or scenario.duration_s
    tick = 1.0 / scenario.tick_hz
    log.info("scenario_start", scenario=scenario.name, duration_s=duration, n_targets=len(scenario.targets))

    targets = list(scenario.targets)
    start = time.time()

    while time.time() - start < duration:
        t0 = time.time()
        targets = [radar_sim.step_position(t, tick) for t in targets]

        for t in targets:
            rad = radar_sim.reading_for(t)
            await send_with_retry(client, rad)

            if scenario.rf_enabled and random.random() < 0.7:
                rf = rf_sim.reading_for(t)
                await send_with_retry(client, rf)

            if random.random() < 0.5:
                eo = eo_ir_sim.reading_for(t)
                await send_with_retry(client, eo)

        elapsed = time.time() - t0
        await asyncio.sleep(max(0.0, tick - elapsed))

    log.info("scenario_done", scenario=scenario.name)


async def _run(
    scenario: str,
    duration_s: int,
    scenario_sequence: Optional[list[str]],
    loop: bool,
    log_level: str,
) -> None:
    logging.getLogger().setLevel(log_level)
    log.info("sensor_simulator_start", log_level=log_level)

    async with httpx.AsyncClient() as client:
        if scenario_sequence:
            while True:
                for sc_name in scenario_sequence:
                    sc = get_scenario(sc_name)
                    await run_single(sc, client, duration_s)
                if not loop:
                    break
        else:
            while True:
                sc = get_scenario(scenario)
                await run_single(sc, client, duration_s)
                if not loop:
                    break

    log.info("sensor_simulator_done")


@cli.command()
def main(
    scenario: str = typer.Option(
        "single", "--scenario", "-s", envvar="SCENARIO", help="Scenario name"
    ),
    duration_s: int = typer.Option(
        0, "--duration", "-d", envvar="DURATION_S", help="Duration in seconds (0 = scenario default)"
    ),
    scenario_sequence: Optional[list[str]] = typer.Option(
        None, "--scenario-sequence", help="Run scenarios in sequence"
    ),
    loop: bool = typer.Option(
        False, "--loop", help="Loop the scenario(s) indefinitely"
    ),
    log_level: str = typer.Option(
        "INFO", "--log-level", envvar="LOG_LEVEL", help="Logging level"
    ),
) -> None:
    asyncio.run(_run(scenario, duration_s, scenario_sequence, loop, log_level))


if __name__ == "__main__":
    cli()
