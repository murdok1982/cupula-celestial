"""Pipeline ensemble.

Componentes:
  1. CNN micro-Doppler (radar)            — STUB ONNX si los pesos no existen.
  2. EfficientNet-B0 EO/IR                — STUB ONNX si los pesos no existen.
  3. MLP firma espectral (RF)             — STUB.
  4. Reglas físicas (velocidad, altura, perfil cinemático) — DETERMINISTA.

El stacking final pondera mediante coeficientes calibrados (PoC).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

from app.models import ClassificationResult, ThreatClass, TrackFeatures

logger = logging.getLogger(__name__)

try:
    import onnxruntime as ort  # type: ignore
except Exception:  # noqa: BLE001
    ort = None  # type: ignore[assignment]
    logger.warning("onnxruntime no disponible; ensemble usará sólo reglas")

ARTIFACT_DIR = Path(__file__).resolve().parents[2] / "models_artifacts"


class OnnxStub:
    """Carga un .onnx si existe y tiene un tamaño razonable; si no, devuelve scores ficticios."""

    def __init__(self, model_path: Path) -> None:
        self.model_path = model_path
        self.session: Any | None = None
        if ort is not None and model_path.exists() and model_path.stat().st_size > 256:
            try:
                self.session = ort.InferenceSession(
                    str(model_path),
                    providers=["CPUExecutionProvider"],
                )
                logger.info("modelo cargado: %s", model_path)
            except Exception as exc:  # noqa: BLE001
                logger.warning("no se pudo cargar %s: %s", model_path, exc)

    def predict_proba(self, features: np.ndarray) -> dict[str, float]:
        """STUB heurístico determinista si no hay modelo."""
        if self.session is None:
            return self._stub_proba(features)
        try:
            input_name = self.session.get_inputs()[0].name
            out = self.session.run(None, {input_name: features.astype(np.float32)})
            arr = np.asarray(out[0]).flatten()
            return self._softmax_to_dict(arr)
        except Exception as exc:  # noqa: BLE001
            logger.warning("inferencia ONNX falló: %s; usando stub", exc)
            return self._stub_proba(features)

    @staticmethod
    def _softmax_to_dict(arr: np.ndarray) -> dict[str, float]:
        e = np.exp(arr - arr.max())
        p = e / e.sum()
        keys = [c.value for c in ThreatClass][: len(p)]
        return dict(zip(keys, [float(x) for x in p], strict=False))

    @staticmethod
    def _stub_proba(features: np.ndarray) -> dict[str, float]:
        # Stub determinista: scores ligeramente diferenciados por norma del vector.
        n = float(np.linalg.norm(features))
        seed = (int(n * 1000)) % 7
        order = [
            ThreatClass.UNKNOWN,
            ThreatClass.BIRD,
            ThreatClass.CIVIL,
            ThreatClass.MIL_FRIEND,
            ThreatClass.MIL_NEUTRAL,
            ThreatClass.THREAT_PROBABLE,
            ThreatClass.HOSTILE_CONFIRMED,
        ]
        base = np.ones(len(order)) / len(order)
        base[seed] += 0.3
        base /= base.sum()
        return {c.value: float(p) for c, p in zip(order, base, strict=False)}


class RuleBased:
    """Reglas físicas explícitas (auditables, determinísticas)."""

    @staticmethod
    def score(f: TrackFeatures) -> tuple[dict[str, float], list[str]]:
        scores: dict[str, float] = {c.value: 0.0 for c in ThreatClass}
        reasons: list[str] = []

        # IFF amigo: clasifica friend con altísima prob
        if f.has_iff_response:
            scores[ThreatClass.MIL_FRIEND.value] = 0.95
            reasons.append("IFF cooperativo válido")
            return scores, reasons

        # Aves: velocidad baja, altura baja, RCS muy bajo (--)
        if f.speed_mps < 25 and f.altitude_agl_m < 100 and f.rcs_dbsm < -30:
            scores[ThreatClass.BIRD.value] = 0.7
            reasons.append("perfil cinemático compatible con ave")
            return scores, reasons

        # Civil registrado (Remote ID + corredor conocido)
        if f.in_known_corridor and f.altitude_agl_m < 120 and f.speed_mps < 25:
            scores[ThreatClass.CIVIL.value] = 0.85
            reasons.append("dentro de corredor U-space, perfil civil")
            return scores, reasons

        # Loitering munition / Shahed-like: rápido, altitud media, RCS bajo
        if 40 <= f.speed_mps <= 80 and 100 <= f.altitude_agl_m <= 800 and -25 <= f.rcs_dbsm <= -5:
            scores[ThreatClass.THREAT_PROBABLE.value] = 0.6
            scores[ThreatClass.HOSTILE_CONFIRMED.value] = 0.2
            reasons.append("perfil tipo loitering munition (vel/altitud/RCS)")

        # Micro-Doppler periódico → rotores (UAV)
        if f.micro_doppler_period_ms and 5 <= f.micro_doppler_period_ms <= 60:
            scores[ThreatClass.THREAT_PROBABLE.value] += 0.25
            reasons.append(f"micro-Doppler periodo {f.micro_doppler_period_ms:.1f}ms → rotores")

        # Firma RF de TX enemigo conocido
        if f.spectrum_signature in {"OcuSync_v3", "ELRS_915", "Skydroid_5G"}:
            scores[ThreatClass.HOSTILE_CONFIRMED.value] += 0.45
            reasons.append(f"firma RF: {f.spectrum_signature}")

        # Normaliza
        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}
        # Si tras todo es plano, queda UNKNOWN dominante
        if max(scores.values()) < 0.4:
            scores[ThreatClass.UNKNOWN.value] = 0.5
            scores = {k: v / sum(scores.values()) for k, v in scores.items()}
            reasons.append("no se alcanzó umbral por reglas → UNKNOWN")
        return scores, reasons


class EnsembleClassifier:
    def __init__(self) -> None:
        self.cnn_doppler = OnnxStub(ARTIFACT_DIR / "cnn_micro_doppler.onnx")
        self.cnn_eoir = OnnxStub(ARTIFACT_DIR / "efficientnet_eoir.onnx")
        self.mlp_rf = OnnxStub(ARTIFACT_DIR / "mlp_rf_spectrum.onnx")
        self.rule = RuleBased()
        # Pesos del stacking (calibrados a mano en PoC).
        self.weights = {"rule": 0.45, "cnn_doppler": 0.20, "cnn_eoir": 0.20, "mlp_rf": 0.15}

    def classify(self, f: TrackFeatures) -> ClassificationResult:
        # Vector de features para los stubs ONNX
        feat_vec = np.array(
            [
                f.speed_mps,
                f.altitude_agl_m,
                f.rcs_dbsm,
                f.doppler_mps,
                f.micro_doppler_period_ms or 0.0,
                1.0 if f.has_iff_response else 0.0,
                1.0 if f.in_known_corridor else 0.0,
            ],
            dtype=np.float32,
        ).reshape(1, -1)

        s_rule, reasons = self.rule.score(f)
        s_doppler = self.cnn_doppler.predict_proba(feat_vec)
        s_eoir = self.cnn_eoir.predict_proba(feat_vec)
        s_rf = self.mlp_rf.predict_proba(feat_vec)

        keys = [c.value for c in ThreatClass]
        combined: dict[str, float] = {k: 0.0 for k in keys}
        for key, src in [
            ("rule", s_rule),
            ("cnn_doppler", s_doppler),
            ("cnn_eoir", s_eoir),
            ("mlp_rf", s_rf),
        ]:
            w = self.weights[key]
            for k in keys:
                combined[k] += w * src.get(k, 0.0)
        # Normalizar
        total = sum(combined.values()) or 1.0
        combined = {k: v / total for k, v in combined.items()}

        cls = max(combined.items(), key=lambda x: x[1])
        return ClassificationResult(
            track_id=f.track_id,
            classification=ThreatClass(cls[0]),
            confidence=cls[1],
            ensemble_scores=combined,
            reasons=reasons,
            timestamp=f.timestamp,
        )
