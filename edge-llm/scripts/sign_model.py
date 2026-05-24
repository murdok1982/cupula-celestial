"""sign_model.py — empaqueta + firma un modelo VLM con Ed25519.

Genera bundle:
    out_dir/
        <model_file_name>
        manifest.json
        manifest.sig

Uso:
    python edge-llm/scripts/sign_model.py \\
        --model /path/to/yolov8n.onnx \\
        --signing-key edge-llm/keys/dev-signing.key \\
        --out-dir edge-llm/models/yolov8n-uas-v1.4.2.bundle \\
        --name yolov8n-uas-detector \\
        --version 1.4.2 \\
        --train-dataset-hash sha256:abc... \\
        --signed-by cupula-modelops \\
        --trust-level production
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization


def load_signing_key(path: Path) -> Ed25519PrivateKey:
    data = path.read_bytes()
    if b"BEGIN PRIVATE KEY" in data or b"BEGIN OPENSSH PRIVATE KEY" in data:
        return serialization.load_pem_private_key(data, password=None)  # type: ignore[return-value]
    if len(data) == 32:
        return Ed25519PrivateKey.from_private_bytes(data)
    try:
        raw = bytes.fromhex(data.decode().strip())
        return Ed25519PrivateKey.from_private_bytes(raw)
    except Exception as e:
        raise SystemExit(f"formato signing key no reconocido: {path}") from e


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Firma un modelo VLM con Ed25519.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--signing-key", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument(
        "--format",
        default=None,
        help="Por defecto se infiere de la extensión del modelo.",
    )
    parser.add_argument(
        "--train-dataset-hash",
        required=True,
        help="Hash del dataset de entrenamiento (sha256:...).",
    )
    parser.add_argument("--signed-by", required=True)
    parser.add_argument(
        "--trust-level",
        choices=["development", "staging", "production"],
        default="development",
    )
    args = parser.parse_args(argv)

    if not args.model.exists():
        print(f"modelo no existe: {args.model}", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out_model = args.out_dir / args.model.name
    shutil.copy2(args.model, out_model)

    sha = hashlib.sha256(out_model.read_bytes()).hexdigest()
    fmt = args.format or args.model.suffix.lstrip(".").lower() or "bin"

    manifest = {
        "model_name": args.name,
        "version": args.version,
        "format": fmt,
        "model_file": args.model.name,
        "sha256": sha,
        "train_dataset_hash": args.train_dataset_hash,
        "signed_by": args.signed_by,
        "signed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "trust_level": args.trust_level,
    }

    manifest_path = args.out_dir / "manifest.json"
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    manifest_path.write_bytes(manifest_bytes)

    sk = load_signing_key(args.signing_key)
    sig = sk.sign(manifest_bytes)
    (args.out_dir / "manifest.sig").write_bytes(sig)

    print(f"bundle firmado en {args.out_dir}")
    print(f"  model: {out_model.name}")
    print(f"  sha256: {sha}")
    print(f"  signature: {len(sig)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
