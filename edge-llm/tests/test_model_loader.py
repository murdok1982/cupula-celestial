"""Tests del SignedModelLoader."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from pipeline.model_loader import (
    ModelManifest,
    ModelVerificationError,
    SignedModelLoader,
)


def _write_pubkey(sk: Ed25519PrivateKey, path: Path) -> None:
    pub = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    path.write_bytes(pub)


def _build_bundle(tmp: Path, sk: Ed25519PrivateKey, model_data: bytes, manifest_overrides=None) -> Path:
    bundle = tmp / "bundle"
    bundle.mkdir()
    model_path = bundle / "model.onnx"
    model_path.write_bytes(model_data)
    sha = hashlib.sha256(model_data).hexdigest()
    manifest = {
        "model_name": "test-detector",
        "version": "0.0.1",
        "format": "onnx",
        "model_file": "model.onnx",
        "sha256": sha,
        "train_dataset_hash": "sha256:dummy",
        "signed_by": "tests",
        "signed_at": "2026-01-01T00:00:00Z",
        "trust_level": "development",
        "valid_until": "2099-12-31T23:59:59Z",
    }
    if manifest_overrides:
        manifest.update(manifest_overrides)
    mb = json.dumps(manifest, sort_keys=True, indent=2).encode("utf-8")
    (bundle / "manifest.json").write_bytes(mb)
    (bundle / "manifest.sig").write_bytes(sk.sign(mb))
    return bundle


def test_valid_bundle_passes(tmp_path: Path):
    sk = Ed25519PrivateKey.generate()
    pub_path = tmp_path / "pub.pem"
    _write_pubkey(sk, pub_path)
    bundle = _build_bundle(tmp_path, sk, b"FAKE_ONNX_DATA")
    loader = SignedModelLoader(pub_path)
    manifest, model_path = loader.load_or_raise(bundle)
    assert isinstance(manifest, ModelManifest)
    assert model_path.exists()
    assert manifest.model_name == "test-detector"


def test_tampered_model_rejected(tmp_path: Path):
    sk = Ed25519PrivateKey.generate()
    pub_path = tmp_path / "pub.pem"
    _write_pubkey(sk, pub_path)
    bundle = _build_bundle(tmp_path, sk, b"ORIGINAL")
    # Manipular el modelo después de firmar
    (bundle / "model.onnx").write_bytes(b"TAMPERED_PAYLOAD")
    loader = SignedModelLoader(pub_path)
    with pytest.raises(ModelVerificationError, match="sha256"):
        loader.load_or_raise(bundle)


def test_invalid_signature_rejected(tmp_path: Path):
    sk_correct = Ed25519PrivateKey.generate()
    sk_other = Ed25519PrivateKey.generate()
    pub_path = tmp_path / "pub.pem"
    _write_pubkey(sk_correct, pub_path)
    bundle = _build_bundle(tmp_path, sk_other, b"PAYLOAD")
    loader = SignedModelLoader(pub_path)
    with pytest.raises(ModelVerificationError, match="firma"):
        loader.load_or_raise(bundle)


def test_missing_manifest_rejected(tmp_path: Path):
    sk = Ed25519PrivateKey.generate()
    pub_path = tmp_path / "pub.pem"
    _write_pubkey(sk, pub_path)
    bundle = _build_bundle(tmp_path, sk, b"PAYLOAD")
    (bundle / "manifest.json").unlink()
    loader = SignedModelLoader(pub_path)
    with pytest.raises(ModelVerificationError, match="manifest.json"):
        loader.load_or_raise(bundle)


def test_manifest_missing_fields_rejected(tmp_path: Path):
    sk = Ed25519PrivateKey.generate()
    pub_path = tmp_path / "pub.pem"
    _write_pubkey(sk, pub_path)
    # Construir manifest sin "version"
    bundle = tmp_path / "b"
    bundle.mkdir()
    (bundle / "model.onnx").write_bytes(b"X")
    bad_manifest = {"model_name": "x"}
    mb = json.dumps(bad_manifest).encode("utf-8")
    (bundle / "manifest.json").write_bytes(mb)
    (bundle / "manifest.sig").write_bytes(sk.sign(mb))
    loader = SignedModelLoader(pub_path)
    with pytest.raises(ModelVerificationError, match="missing"):
        loader.load_or_raise(bundle)
