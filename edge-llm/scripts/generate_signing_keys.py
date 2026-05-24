"""Genera un par Ed25519 para firma de modelos VLM y LoRA adapters (DEV).

En producción: la clave privada vive en HSM. Este script es sólo para PoC.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("edge-llm/keys"))
    parser.add_argument("--name", default="dev-signing")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    sk = Ed25519PrivateKey.generate()
    priv_path = args.out_dir / f"{args.name}.key"
    pub_path = args.out_dir / f"{args.name}.pub"

    priv_path.write_bytes(
        sk.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    pub_path.write_bytes(
        sk.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )

    # Permisos restrictivos (Linux); Windows ignora chmod.
    try:
        priv_path.chmod(0o600)
    except OSError:
        pass

    print(f"Generadas claves Ed25519 en:")
    print(f"  Privada (NO commit): {priv_path}")
    print(f"  Pública (distribuible): {pub_path}")
    print()
    print(f"Distribuir SOLO la pública a Jetson edge nodes.")
    print(f"Privada PROTEGER (idealmente HSM en producción).")


if __name__ == "__main__":
    main()
