"""Chaos Runner — orchestrates and executes chaos experiments."""

from __future__ import annotations

import json
import logging
import random
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .experiments import (
    ExperimentResult,
    build_experiment,
)
from .probes import ProbeResult, run_all_probes
from .report import ChaosReport

log = logging.getLogger("chaos.runner")


@dataclass
class BatteryConfig:
    name: str = "chaos_battery"
    experiments: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    probes_before: bool = True
    probes_after: bool = True


@dataclass
class ChaosRunResult:
    battery_name: str
    started_at: datetime
    ended_at: datetime
    experiments: list[ExperimentResult]
    probes_before: dict[str, ProbeResult] = field(default_factory=dict)
    probes_after: dict[str, ProbeResult] = field(default_factory=dict)
    global_passed: bool = True
    summary: dict[str, Any] = field(default_factory=dict)


class ChaosRunner:
    def __init__(
        self,
        config: BatteryConfig,
        strategy: str = "sequential",
        prometheus_url: str = "http://prometheus:9090",
    ) -> None:
        self.config = config
        self.strategy = strategy
        self.prometheus_url = prometheus_url
        self._running = True
        self._experiment_results: list[ExperimentResult] = []
        self._probes_before: dict[str, ProbeResult] = {}
        self._probes_after: dict[str, ProbeResult] = {}
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _handle_signal(self, signum: int, _frame: Any) -> None:
        log.warning("signal_received", signum=signum)
        self._running = False

    def run(self) -> ChaosRunResult:
        started_at = datetime.now(timezone.utc)
        log.info(
            "chaos_run_start",
            battery=self.config.name,
            strategy=self.strategy,
            experiment_count=len(self.config.experiments),
        )

        if self.config.probes_before:
            log.info("running_probes_before")
            self._probes_before = run_all_probes(
                prometheus_url=self.prometheus_url
            )

        experiments = list(self.config.experiments)
        if self.strategy == "random":
            random.shuffle(experiments)
        elif self.strategy == "continuous":
            experiments = self._build_continuous(experiments)

        for exp_cfg in experiments:
            if not self._running:
                log.warning("run_interrupted")
                break
            try:
                exp = build_experiment(exp_cfg)
                duration = exp_cfg.get("duration", 15)
                result = exp.run(duration=duration)
                self._experiment_results.append(result)
                if not result.passed:
                    log.warning(
                        "experiment_failed",
                        name=result.name,
                        error=result.error,
                    )
            except Exception as exc:
                log.exception("experiment_build_error", error=str(exc))
                self._experiment_results.append(
                    ExperimentResult(
                        name=exp_cfg.get("type", "unknown"),
                        description=exp_cfg.get("description", ""),
                        started_at=datetime.now(timezone.utc),
                        ended_at=datetime.now(timezone.utc),
                        duration_seconds=0.0,
                        passed=False,
                        error=str(exc),
                    )
                )

        if self.config.probes_after:
            log.info("running_probes_after")
            self._probes_after = run_all_probes(
                prometheus_url=self.prometheus_url
            )

        ended_at = datetime.now(timezone.utc)
        summary = self._compute_summary()
        global_passed = (
            all(r.passed for r in self._experiment_results)
            and all(
                p.passed for p in self._probes_after.values()
            )
        )

        result = ChaosRunResult(
            battery_name=self.config.name,
            started_at=started_at,
            ended_at=ended_at,
            experiments=self._experiment_results,
            probes_before=self._probes_before,
            probes_after=self._probes_after,
            global_passed=global_passed,
            summary=summary,
        )
        log.info(
            "chaos_run_end",
            passed=global_passed,
            total=summary.get("total", 0),
            passed_count=summary.get("passed", 0),
            failed=summary.get("failed", 0),
        )
        return result

    def _build_continuous(
        self, experiments: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        looped: list[dict[str, Any]] = []
        for _ in range(3):
            random.shuffle(experiments)
            looped.extend(experiments)
        return looped

    def _compute_summary(self) -> dict[str, Any]:
        total = len(self._experiment_results)
        passed = sum(1 for r in self._experiment_results if r.passed)
        failed = total - passed
        return {
            "total": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": round(passed / total * 100, 1) if total else 0.0,
            "total_duration_seconds": sum(
                r.duration_seconds for r in self._experiment_results
            ),
        }


def load_config(path: str | Path) -> BatteryConfig:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config not found: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    battery = raw.get("battery", {})
    metrics = raw.get("metrics", {})
    return BatteryConfig(
        name=battery.get("name", "chaos_battery"),
        experiments=battery.get("experiments", []),
        metrics=metrics,
    )


def run_from_cli(args: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Cúpula Celestial — Chaos Engineering Runner"
    )
    parser.add_argument(
        "--config",
        default=None,
        help="Path to chaos config YAML",
    )
    parser.add_argument(
        "--experiment",
        choices=[
            "kill_service",
            "network_partition",
            "latency_injection",
            "packet_loss",
            "resource_exhaustion",
            "kafka_failure",
            "database_failover",
            "cert_expiration",
        ],
        help="Single experiment type",
    )
    parser.add_argument("--service", help="Target service name")
    parser.add_argument("--target", help="Target service for network partition")
    parser.add_argument("--duration", type=int, default=15, help="Experiment duration")
    parser.add_argument(
        "--latency-ms", type=int, default=500, help="Latency in ms"
    )
    parser.add_argument(
        "--jitter-ms", type=int, default=100, help="Jitter in ms"
    )
    parser.add_argument(
        "--loss-percent", type=float, default=10.0, help="Packet loss percent"
    )
    parser.add_argument(
        "--cpu-percent", type=int, default=90, help="CPU limit percent"
    )
    parser.add_argument(
        "--memory-mb", type=int, default=0, help="Memory limit in MB"
    )
    parser.add_argument(
        "--strategy",
        choices=["sequential", "random", "continuous"],
        default="sequential",
    )
    parser.add_argument("--list", action="store_true", dest="list_experiments", help="List available experiments")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without executing")
    parser.add_argument("--prometheus", default="http://prometheus:9090")
    parser.add_argument("--output", default=None, help="Output directory for report")

    parsed = parser.parse_args(args)

    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    if parsed.list_experiments:
        from .experiments import EXPERIMENT_REGISTRY
        print("Available experiments:")
        for name, cls in EXPERIMENT_REGISTRY.items():
            print(f"  {name:30s} - {cls.__doc__ or ''}")
        return 0

    if parsed.config:
        config = load_config(parsed.config)
    elif parsed.experiment:
        exp_cfg: dict[str, Any] = {
            "type": parsed.experiment,
            "duration": parsed.duration,
        }
        if parsed.service:
            exp_cfg["service"] = parsed.service
        if parsed.target:
            exp_cfg["target"] = parsed.target
        if parsed.latency_ms:
            exp_cfg["latency_ms"] = parsed.latency_ms
        if parsed.jitter_ms:
            exp_cfg["jitter_ms"] = parsed.jitter_ms
        if parsed.loss_percent:
            exp_cfg["loss_percent"] = parsed.loss_percent
        if parsed.cpu_percent:
            exp_cfg["cpu_percent"] = parsed.cpu_percent
        if parsed.memory_mb:
            exp_cfg["memory_mb"] = parsed.memory_mb
        config = BatteryConfig(
            name="single_experiment",
            experiments=[exp_cfg],
        )
    else:
        config_path = Path(__file__).parent / "config.yaml"
        if config_path.exists():
            config = load_config(config_path)
        else:
            parser.print_help()
            return 1

    if parsed.dry_run:
        print(f"Dry-run: {config.name}")
        print(f"Strategy: {parsed.strategy}")
        print(f"Experiments ({len(config.experiments)}):")
        for exp in config.experiments:
            print(f"  - {exp.get('type')}: {exp.get('description', '')}")
        return 0

    runner = ChaosRunner(
        config=config,
        strategy=parsed.strategy,
        prometheus_url=parsed.prometheus,
    )
    result = runner.run()

    report = ChaosReport(
        experiments_results=[r for r in result.experiments],
        start_time=result.started_at,
        end_time=result.ended_at,
        probes_before=result.probes_before,
        probes_after=result.probes_after,
        battery_name=result.battery_name,
    )
    output_dir = parsed.output or str(Path.cwd() / "chaos-report")
    report_path = report.save(output_dir)
    print(f"Report saved to {report_path}")
    print(f"JSON exported to {report.json_path}")
    print(f"Summary: {result.summary}")

    return 0 if result.global_passed else 1
