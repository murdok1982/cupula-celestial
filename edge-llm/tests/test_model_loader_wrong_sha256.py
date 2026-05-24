from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from pipeline.model_loader import ModelVerificationError, SignedModelLoader


def _write_pubkey(sk: Ed25519PrivateKey, path: Path) -> None:
    pub = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    path.write_bytes(pub)


def test_model_loader_wrong_sha256_rejected(tmp_path: Path):
    sk = Ed25519PrivateKey.generate()
    pub_path = tmp_path / "pub.pem"
    _write_pubkey(sk, pub_path)
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    model_path = bundle / "model.onnx"
    model_path.write_bytes(b"ORIGINAL_DATA")
    wrong_sha = hashlib.sha256(b"DIFFERENT_DATA").hexdigest()
    manifest = {
        "model_name": "test-detector",
        "version": "0.0.1",
        "format": "onnx",
        "model_file": "model.onnx",
        "sha256": wrong_sha,
        "train_dataset_hash": "sha256:dummy",
        "signed_by": "tests",
        "signed_at": "2026-01-01T00:00:00Z",
        "trust_level": "development",
    }
    mb = json.dumps(manifest, sort_keys=True, indent=2).encode("utf-8")
    (bundle / "manifest.json").write_bytes(mb)
    (bundle / "manifest.sig").write_bytes(sk.sign(mb))
    loader = SignedModelLoader(pub_path)
    with pytest.raises(ModelVerificationError, match="sha256"):
        loader.load_or_raise(bundle)
