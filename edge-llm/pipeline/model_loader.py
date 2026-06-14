"""Signed model loader — FASE 2.

Verifica firma Ed25519 sobre un manifest JSON que describe el modelo (sha256,
metadata) ANTES de cargar el modelo en memoria. Si la firma no valida o el
sha256 del fichero no coincide, RECHAZA la carga.

Estructura de bundle esperado:
    <bundle_dir>/
        model.onnx          (o model.pt, model.gguf, ...)
        manifest.json       (metadata firmable)
        manifest.sig        (firma Ed25519 de manifest.json, raw 64 bytes o hex)

`manifest.json` ejemplo:
{
    "model_name": "yolov8n-uas-detector",
    "version": "1.4.2",
    "format": "onnx",
    "model_file": "model.onnx",
    "sha256": "abc...",
    "train_dataset_hash": "sha256:...",
    "signed_by": "cupula-modelops",
    "signed_at": "2026-04-12T10:00:00Z",
    "trust_level": "production"
}
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PublicKey,
)

log = logging.getLogger(__name__)


class ModelVerificationError(Exception):
    """La verificación de firma o hash del modelo falló."""


@dataclass(frozen=True)
class ModelManifest:
    model_name: str
    version: str
    format: str
    model_file: str
    sha256: str
    train_dataset_hash: str
    signed_by: str
    signed_at: str
    trust_level: str
    valid_until: str

    @staticmethod
    def from_dict(d: dict) -> "ModelManifest":
        required = [
            "model_name",
            "version",
            "format",
            "model_file",
            "sha256",
            "train_dataset_hash",
            "signed_by",
            "signed_at",
            "trust_level",
            "valid_until",
        ]
        missing = [k for k in required if k not in d]
        if missing:
            raise ModelVerificationError(f"manifest missing keys: {missing}")
        return ModelManifest(**{k: d[k] for k in required})


class SignedModelLoader:
    """Cargador con verificación de firma + hash."""

    def __init__(self, pubkey_path: Path):
        self.pubkey_path = Path(pubkey_path)
        if not self.pubkey_path.exists():
            raise FileNotFoundError(f"pubkey not found: {self.pubkey_path}")
        self._pubkey = self._load_pubkey(self.pubkey_path)

    @staticmethod
    def _load_pubkey(path: Path) -> Ed25519PublicKey:
        data = path.read_bytes()
        # Soporta PEM o raw 32 bytes
        if b"BEGIN PUBLIC KEY" in data:
            return serialization.load_pem_public_key(data)  # type: ignore[return-value]
        if len(data) == 32:
            return Ed25519PublicKey.from_public_bytes(data)
        # hex 64
        try:
            raw = bytes.fromhex(data.decode().strip())
            return Ed25519PublicKey.from_public_bytes(raw)
        except Exception as e:
            raise ModelVerificationError(
                f"formato pubkey no reconocido: {path}"
            ) from e

    def verify_bundle(self, bundle_dir: Path) -> ModelManifest:
        """Verifica un bundle y devuelve el manifest validado. Lanza si falla."""
        bundle_dir = Path(bundle_dir)
        manifest_path = bundle_dir / "manifest.json"
        sig_path = bundle_dir / "manifest.sig"

        if not manifest_path.exists():
            raise ModelVerificationError(f"manifest.json no existe en {bundle_dir}")
        if not sig_path.exists():
            raise ModelVerificationError(f"manifest.sig no existe en {bundle_dir}")

        manifest_bytes = manifest_path.read_bytes()
        sig_bytes_raw = sig_path.read_bytes()
        try:
            sig_bytes_raw.decode("ascii")
            sig_bytes_raw = sig_bytes_raw.strip()
        except (UnicodeDecodeError, AttributeError):
            pass
        if len(sig_bytes_raw) == 64:
            sig_bytes = sig_bytes_raw
        elif len(sig_bytes_raw) == 128:
            sig_bytes = bytes.fromhex(sig_bytes_raw.decode())
        else:
            raise ModelVerificationError(
                f"manifest.sig tamaño inesperado: {len(sig_bytes_raw)} (esperado 64 raw o 128 hex)"
            )

        try:
            self._pubkey.verify(sig_bytes, manifest_bytes)
        except InvalidSignature as e:
            raise ModelVerificationError("firma del manifest INVÁLIDA") from e

        manifest = ModelManifest.from_dict(json.loads(manifest_bytes))

        # Verificar sha256 del modelo
        model_path = bundle_dir / manifest.model_file
        if not model_path.exists():
            raise ModelVerificationError(f"modelo declarado no existe: {model_path}")
        computed = hashlib.sha256(model_path.read_bytes()).hexdigest()
        if computed != manifest.sha256:
            raise ModelVerificationError(
                f"sha256 del modelo no coincide: stored={manifest.sha256} computed={computed}"
            )

        try:
            valid_until = datetime.fromisoformat(manifest.valid_until.replace("Z", "+00:00"))
            if valid_until < datetime.now(tz=timezone.utc):
                raise ModelVerificationError("manifest expired: valid_until passed")
        except ValueError as e:
            raise ModelVerificationError(f"valid_until timestamp inválido: {e}") from e

        log.warning(
            "Modelo VERIFICADO ✓ name=%s version=%s trust=%s signed_by=%s",
            manifest.model_name,
            manifest.version,
            manifest.trust_level,
            manifest.signed_by,
        )
        return manifest

    def load_or_raise(self, bundle_dir: Path) -> tuple[ModelManifest, Path]:
        """Verifica y devuelve `(manifest, path_al_modelo)`. Llamar antes de cargar."""
        manifest = self.verify_bundle(bundle_dir)
        return manifest, Path(bundle_dir) / manifest.model_file
