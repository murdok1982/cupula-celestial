"""Chaos Engineering experiments for Cúpula Celestial C-UAS system."""

from __future__ import annotations

import logging
import os
import random
import signal
import subprocess
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("chaos.experiments")

SERVICES_NETWORK = "cupula-celestial_cupula"


@dataclass
class ExperimentResult:
    name: str
    description: str
    started_at: datetime
    ended_at: datetime
    duration_seconds: float
    passed: bool
    details: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class BaseExperiment(ABC):
    name: str = ""
    description: str = ""

    def __init__(self) -> None:
        self._result: ExperimentResult | None = None
        self._docker_client: Any = None

    @property
    def _docker(self) -> Any:
        if self._docker_client is None:
            import docker  # type: ignore[import-untyped]

            self._docker_client = docker.from_env()
        return self._docker_client

    @abstractmethod
    def _inject(self) -> dict[str, Any]: ...

    @abstractmethod
    def _recover(self) -> None: ...

    @abstractmethod
    def _verify(self, details: dict[str, Any]) -> bool: ...

    def _get_container(self, service_name: str) -> Any:
        container_labels = {
            "sensor-ingest": "cupula-sensor-ingest",
            "track-fusion": "cupula-track-fusion",
            "swarm-controller": "cupula-swarm-controller",
            "hmi-gateway": "cupula-hmi-gateway",
            "audit-log": "cupula-audit-log",
            "threat-classifier": "cupula-threat-classifier",
            "decision-engine": "cupula-decision-engine",
            "redpanda": "cupula-redpanda",
            "postgres": "cupula-postgres",
            "redis": "cupula-redis",
            "policy-engine": "cupula-opa",
            "jaeger": "cupula-jaeger",
            "ollama": "cupula-ollama",
            "prometheus": "cupula-prometheus",
            "grafana": "cupula-grafana",
        }
        cname = container_labels.get(service_name, service_name)
        try:
            return self._docker.containers.get(cname)
        except Exception:
            candidates = self._docker.containers.list(
                filters={"name": service_name}
            )
            if candidates:
                return candidates[0]
            raise

    def _healthcheck_url(self, service_name: str) -> str:
        port_map: dict[str, int] = {
            "sensor-ingest": 9000,
            "track-fusion": 9100,
            "swarm-controller": 9200,
            "hmi-gateway": 8080,
            "audit-log": 9300,
            "threat-classifier": 8001,
            "decision-engine": 8002,
            "policy-engine": 8181,
        }
        port = port_map.get(service_name, 8080)
        return f"http://{service_name}:{port}/health"

    def run(self, duration: int = 10) -> ExperimentResult:
        started_at = datetime.now(timezone.utc)
        log.info("experiment_start", name=self.name, duration=duration)
        details: dict[str, Any] = {}
        error: str | None = None

        try:
            details = self._inject()
            deadline = time.time() + duration
            while time.time() < deadline:
                time.sleep(0.5)
            passed = self._verify(details)
        except Exception as exc:
            log.exception("experiment_error", name=self.name, error=str(exc))
            passed = False
            error = str(exc)
            details.setdefault("errors", []).append(str(exc))
        finally:
            try:
                self._recover()
            except Exception as exc:
                log.exception("recover_error", name=self.name, error=str(exc))
                details.setdefault("errors", []).append(f"recover: {exc}")

        ended_at = datetime.now(timezone.utc)
        self._result = ExperimentResult(
            name=self.name,
            description=self.description,
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=(ended_at - started_at).total_seconds(),
            passed=passed,
            details=details,
            error=error,
        )
        log.info(
            "experiment_end",
            name=self.name,
            passed=passed,
            duration_seconds=self._result.duration_seconds,
        )
        return self._result


class KillServiceExperiment(BaseExperiment):
    def __init__(self, service_name: str, duration: int = 30) -> None:
        super().__init__()
        self.service_name = service_name
        self._duration = duration
        self.name = f"kill_service_{service_name}"
        self.description = f"Mata el servicio {service_name} y verifica recuperación"

    def _inject(self) -> dict[str, Any]:
        container = self._get_container(self.service_name)
        log.info("killing_service", service=self.service_name, cid=container.id)
        container.stop(timeout=5)
        return {"container_id": container.id, "status_before": "running"}

    def _recover(self) -> None:
        container = self._get_container(self.service_name)
        log.info("restoring_service", service=self.service_name)
        container.start()
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                container.reload()
                if container.status == "running":
                    return
            except Exception:
                pass
            time.sleep(1)
        raise RuntimeError(
            f"{self.service_name} no se recuperó tras 30s"
        )

    def _verify(self, details: dict[str, Any]) -> bool:
        container = self._get_container(self.service_name)
        return container.status == "running"


class NetworkPartitionExperiment(BaseExperiment):
    def __init__(
        self,
        service_name: str,
        target_service: str,
        duration: int = 15,
    ) -> None:
        super().__init__()
        self.service_name = service_name
        self.target_service = target_service
        self._duration = duration
        self.name = f"net_part_{service_name}_to_{target_service}"
        self.description = (
            f"Aísla red entre {service_name} y {target_service}"
        )

    def _inject(self) -> dict[str, Any]:
        container = self._get_container(self.service_name)
        target = self._get_container(self.target_service)
        network = self._resolve_network(container)
        log.info(
            "disconnecting_network",
            service=self.service_name,
            target=self.target_service,
            network=network,
        )
        self._docker.networks.get(network).disconnect(container)
        return {
            "container_id": container.id,
            "target_id": target.id,
            "network": network,
        }

    def _resolve_network(self, container: Any) -> str:
        for net_name in container.attrs["NetworkSettings"]["Networks"]:
            return net_name
        return SERVICES_NETWORK

    def _recover(self) -> None:
        container = self._get_container(self.service_name)
        network = self._resolve_network(container)
        try:
            self._docker.networks.get(network).connect(container)
            log.info("reconnected_network", service=self.service_name)
        except Exception as exc:
            log.warning("reconnect_network_attempt", error=str(exc))
            try:
                self._docker.networks.get(SERVICES_NETWORK).connect(
                    container
                )
            except Exception as exc2:
                log.error("reconnect_failed", error=str(exc2))

    def _verify(self, details: dict[str, Any]) -> bool:
        container = self._get_container(self.service_name)
        networks = container.attrs["NetworkSettings"]["Networks"]
        return len(networks) > 0


class LatencyInjectionExperiment(BaseExperiment):
    def __init__(
        self,
        service_name: str,
        latency_ms: int = 500,
        jitter_ms: int = 100,
        duration: int = 20,
    ) -> None:
        super().__init__()
        self.service_name = service_name
        self.latency_ms = latency_ms
        self.jitter_ms = jitter_ms
        self._duration = duration
        self.name = f"latency_{service_name}_{latency_ms}ms"
        self.description = (
            f"Inyecta {latency_ms}ms ±{jitter_ms}ms latencia en {service_name}"
        )
        self._qdisc_added = False

    def _inject(self) -> dict[str, Any]:
        container = self._get_container(self.service_name)
        pid = container.attrs["State"]["Pid"]
        iface = self._find_interface(container)
        cmds = [
            ["nsenter", "-t", str(pid), "-n", "--",
             "tc", "qdisc", "add", "dev", iface, "root", "netem",
             "delay", f"{self.latency_ms}ms", f"{self.jitter_ms}ms",
             "distribution", "normal"],
        ]
        errors = []
        for cmd in cmds:
            try:
                subprocess.run(cmd, capture_output=True, text=True, timeout=10,
                               check=False)
                self._qdisc_added = True
            except FileNotFoundError:
                log.warning("nsenter_no_disponible", cmd=cmd[0])
                errors.append(f"nsenter no disponible")
            except Exception as exc:
                log.warning("tc_inject_error", error=str(exc))
                errors.append(str(exc))
        return {
            "container_id": container.id,
            "pid": pid,
            "interface": iface,
            "latency_ms": self.latency_ms,
            "jitter_ms": self.jitter_ms,
            "errors": errors,
        }

    def _find_interface(self, container: Any) -> str:
        networks = container.attrs["NetworkSettings"]["Networks"]
        for net_cfg in networks.values():
            return net_cfg.get("IPAddress", "")
        return "eth0"

    def _recover(self) -> None:
        container = self._get_container(self.service_name)
        pid = container.attrs["State"]["Pid"]
        iface = self._find_interface(container)
        if self._qdisc_added:
            try:
                subprocess.run(
                    ["nsenter", "-t", str(pid), "-n", "--",
                     "tc", "qdisc", "del", "dev", iface, "root"],
                    capture_output=True, text=True, timeout=10, check=False,
                )
                self._qdisc_added = False
            except Exception as exc:
                log.warning("tc_recover_error", error=str(exc))

    def _verify(self, details: dict[str, Any]) -> bool:
        return not self._qdisc_added


class PacketLossExperiment(BaseExperiment):
    def __init__(
        self,
        service_name: str,
        loss_percent: float = 10.0,
        duration: int = 15,
    ) -> None:
        super().__init__()
        self.service_name = service_name
        self.loss_percent = loss_percent
        self._duration = duration
        self.name = f"packet_loss_{service_name}_{loss_percent}%"
        self.description = (
            f"Inyecta {loss_percent}% pérdida paquetes en {service_name}"
        )
        self._qdisc_added = False

    def _inject(self) -> dict[str, Any]:
        container = self._get_container(self.service_name)
        pid = container.attrs["State"]["Pid"]
        iface = self._find_interface(container)
        try:
            subprocess.run(
                ["nsenter", "-t", str(pid), "-n", "--",
                 "tc", "qdisc", "add", "dev", iface, "root", "netem",
                 "loss", f"{self.loss_percent}%"],
                capture_output=True, text=True, timeout=10, check=False,
            )
            self._qdisc_added = True
        except FileNotFoundError:
            log.warning("nsenter_no_disponible")
        except Exception as exc:
            log.warning("packet_loss_inject_error", error=str(exc))
        return {
            "container_id": container.id,
            "pid": pid,
            "interface": iface,
            "loss_percent": self.loss_percent,
        }

    def _find_interface(self, container: Any) -> str:
        networks = container.attrs["NetworkSettings"]["Networks"]
        for net_cfg in networks.values():
            return net_cfg.get("IPAddress", "")
        return "eth0"

    def _recover(self) -> None:
        if not self._qdisc_added:
            return
        container = self._get_container(self.service_name)
        pid = container.attrs["State"]["Pid"]
        iface = self._find_interface(container)
        try:
            subprocess.run(
                ["nsenter", "-t", str(pid), "-n", "--",
                 "tc", "qdisc", "del", "dev", iface, "root"],
                capture_output=True, text=True, timeout=10, check=False,
            )
            self._qdisc_added = False
        except Exception as exc:
            log.warning("tc_recover_error", error=str(exc))

    def _verify(self, details: dict[str, Any]) -> bool:
        return not self._qdisc_added


class ResourceExhaustionExperiment(BaseExperiment):
    def __init__(
        self,
        service_name: str,
        cpu_percent: int | None = None,
        memory_mb: int | None = None,
        duration: int = 15,
    ) -> None:
        super().__init__()
        self.service_name = service_name
        self.cpu_percent = cpu_percent
        self.memory_mb = memory_mb
        self._duration = duration
        parts = []
        if cpu_percent:
            parts.append(f"cpu{cpu_percent}")
        if memory_mb:
            parts.append(f"mem{memory_mb}MB")
        tag = "_".join(parts) or "stress"
        self.name = f"resource_{service_name}_{tag}"
        self.description = (
            f"Consume recursos en {service_name}: "
            f"CPU={cpu_percent}% Mem={memory_mb}MB"
        )
        self._stress_proc: subprocess.Popen | None = None
        self._container_cpus_before: str | None = None
        self._container_mem_before: str | None = None

    def _inject(self) -> dict[str, Any]:
        container = self._get_container(self.service_name)
        details: dict[str, Any] = {
            "container_id": container.id,
        }
        if self.cpu_percent:
            try:
                self._container_cpus_before = container.attrs["HostConfig"].get(
                    "CpuQuota"
                )
                cpus = max(1, int(self.cpu_percent / 100.0 * 4))
                container.update(cpu_quota=cpus * 100000, cpu_period=100000)
                details["cpu_quota_set"] = cpus * 100000
            except Exception as exc:
                log.warning("cpu_update_error", error=str(exc))
                details.setdefault("errors", []).append(f"cpu: {exc}")
        if self.memory_mb:
            try:
                self._container_mem_before = container.attrs["HostConfig"].get(
                    "Memory"
                )
                container.update(memory=self.memory_mb * 1024 * 1024)
                details["mem_limit_set"] = self.memory_mb * 1024 * 1024
            except Exception as exc:
                log.warning("mem_update_error", error=str(exc))
                details.setdefault("errors", []).append(f"mem: {exc}")
        return details

    def _recover(self) -> None:
        container = self._get_container(self.service_name)
        try:
            container.update(
                cpu_quota=-1,
                cpu_period=100000,
                memory=0,
                memory_swap=-1,
            )
        except Exception as exc:
            log.warning("resource_recover_error", error=str(exc))

    def _verify(self, details: dict[str, Any]) -> bool:
        container = self._get_container(self.service_name)
        return container.status == "running"


class KafkaFailureExperiment(BaseExperiment):
    def __init__(self, duration: int = 30) -> None:
        super().__init__()
        self._duration = duration
        self.name = "kafka_failure"
        self.description = "Detiene Redpanda y verifica modo degradado"

    def _inject(self) -> dict[str, Any]:
        redpanda = self._get_container("redpanda")
        log.info("pausing_redpanda")
        redpanda.pause()
        return {"container_id": redpanda.id, "action": "pause"}

    def _recover(self) -> None:
        redpanda = self._get_container("redpanda")
        log.info("unpausing_redpanda")
        redpanda.unpause()
        time.sleep(5)

    def _verify(self, details: dict[str, Any]) -> bool:
        import httpx

        service_ports = ["sensor-ingest:9000", "hmi-gateway:8080"]
        for svc in service_ports:
            try:
                resp = httpx.get(
                    f"http://{svc}/health", timeout=5.0, verify=False
                )
                if resp.status_code >= 500:
                    log.warning(
                        "service_not_healthy_during_kafka_failure",
                        service=svc,
                        status=resp.status_code,
                    )
                    return False
            except httpx.ConnectError:
                log.warning(
                    "service_unreachable_during_kafka_failure",
                    service=svc,
                )
                return False
        return True


class DatabaseFailoverExperiment(BaseExperiment):
    def __init__(self, duration: int = 20) -> None:
        super().__init__()
        self._duration = duration
        self.name = "database_failover"
        self.description = "Mata Postgres y verifica que servicios manejan desconexión"

    def _inject(self) -> dict[str, Any]:
        pg = self._get_container("postgres")
        log.info("pausing_postgres")
        pg.pause()
        return {"container_id": pg.id, "action": "pause"}

    def _recover(self) -> None:
        pg = self._get_container("postgres")
        log.info("unpausing_postgres")
        pg.unpause()
        time.sleep(5)

    def _verify(self, details: dict[str, Any]) -> bool:
        import httpx

        services = ["hmi-gateway:8080", "audit-log:9300"]
        for svc in services:
            try:
                resp = httpx.get(
                    f"http://{svc}/health", timeout=5.0, verify=False
                )
                if resp.status_code >= 500:
                    log.warning(
                        "service_unhealthy_db_failover",
                        service=svc,
                        status=resp.status_code,
                    )
                    return False
            except httpx.ConnectError:
                log.warning("service_unreachable_db_failover", service=svc)
                return False
        return True


class CertExpirationExperiment(BaseExperiment):
    def __init__(self, duration: int = 15) -> None:
        super().__init__()
        self._duration = duration
        self.name = "cert_expiration"
        self.description = "Simula expiración de certificado mTLS"

    def _inject(self) -> dict[str, Any]:
        cert_dir = Path(os.environ.get("MTLS_CERT_DIR", "./mtls/certs"))
        backup_dir = cert_dir.parent / "certs_backup_chaos"
        modified: list[str] = []

        if not cert_dir.exists():
            return {"error": "cert_dir_not_found", "path": str(cert_dir)}

        if not backup_dir.exists():
            import shutil
            shutil.copytree(str(cert_dir), str(backup_dir))
            log.info("certs_backup_created", backup=str(backup_dir))

        future_date = "300001010000Z"
        for cert_file in cert_dir.glob("*.crt"):
            try:
                content = cert_file.read_bytes()
                new_content = content.replace(
                    b"Z\n", f"{future_date}\n".encode()
                )
                cert_file.write_bytes(new_content)
                modified.append(cert_file.name)
            except Exception as exc:
                log.warning("cert_modify_error", file=cert_file.name, error=str(exc))

        return {"modified_certs": modified, "backup_dir": str(backup_dir)}

    def _recover(self) -> None:
        cert_dir = Path(os.environ.get("MTLS_CERT_DIR", "./mtls/certs"))
        backup_dir = cert_dir.parent / "certs_backup_chaos"
        if backup_dir.exists():
            import shutil
            shutil.rmtree(str(cert_dir))
            shutil.copytree(str(backup_dir), str(cert_dir))
            shutil.rmtree(str(backup_dir))
            log.info("certs_restored")
        for container_name in [
            "cupula-sensor-ingest",
            "cupula-hmi-gateway",
            "cupula-audit-log",
            "cupula-decision-engine",
            "cupula-threat-classifier",
            "cupula-swarm-controller",
        ]:
            try:
                c = self._docker.containers.get(container_name)
                c.restart(timeout=5)
            except Exception:
                pass

    def _verify(self, details: dict[str, Any]) -> bool:
        import httpx

        for svc in ["hmi-gateway:8080", "audit-log:9300"]:
            try:
                resp = httpx.get(
                    f"http://{svc}/health", timeout=5.0, verify=False
                )
                if resp.status_code >= 500:
                    return False
            except httpx.ConnectError:
                return False
        return True


EXPERIMENT_REGISTRY: dict[str, type[BaseExperiment]] = {
    "kill_service": KillServiceExperiment,
    "network_partition": NetworkPartitionExperiment,
    "latency_injection": LatencyInjectionExperiment,
    "packet_loss": PacketLossExperiment,
    "resource_exhaustion": ResourceExhaustionExperiment,
    "kafka_failure": KafkaFailureExperiment,
    "database_failover": DatabaseFailoverExperiment,
    "cert_expiration": CertExpirationExperiment,
}


def build_experiment(config: dict[str, Any]) -> BaseExperiment:
    exp_type = config["type"]
    cls = EXPERIMENT_REGISTRY.get(exp_type)
    if cls is None:
        raise ValueError(f"Unknown experiment type: {exp_type}")

    kwargs: dict[str, Any] = {"duration": config.get("duration", 15)}

    if exp_type == "kill_service":
        kwargs["service_name"] = config["service"]
    elif exp_type == "network_partition":
        kwargs["service_name"] = config["service"]
        kwargs["target_service"] = config["target"]
    elif exp_type == "latency_injection":
        kwargs["service_name"] = config["service"]
        kwargs["latency_ms"] = config.get("latency_ms", 500)
        kwargs["jitter_ms"] = config.get("jitter_ms", 100)
    elif exp_type == "packet_loss":
        kwargs["service_name"] = config["service"]
        kwargs["loss_percent"] = config.get("loss_percent", 10.0)
    elif exp_type == "resource_exhaustion":
        kwargs["service_name"] = config["service"]
        if "cpu_percent" in config:
            kwargs["cpu_percent"] = config["cpu_percent"]
        if "memory_mb" in config:
            kwargs["memory_mb"] = config["memory_mb"]

    exp = cls(**kwargs)
    exp.description = config.get("description", exp.description)
    return exp
