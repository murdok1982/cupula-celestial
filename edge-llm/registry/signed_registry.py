"""Integrates Model Registry with SignedModelLoader for secure OTA deployment."""
from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from registry.client import ModelRegistryClient, RegisteredModel

logger = logging.getLogger(__name__)


class SignedRegistryClient(ModelRegistryClient):
    """Extended registry client that signs and verifies models."""

    def download_and_verify(
        self,
        name: str,
        output_dir: Path,
        pubkey: Optional[Path] = None,
    ) -> Optional[Path]:
        """Download model and verify signature."""
        model = self.get_latest_production(name)
        if not model:
            logger.warning("No production model found for %s", name)
            return None

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            if not self.download_model(model, tmp_path):
                return None

            if pubkey:
                try:
                    from pipeline.model_loader import SignedModelLoader
                    loader = SignedModelLoader(pubkey)
                    manifest, model_file = loader.verify_bundle(tmp_path)
                    dest = output_dir / model_file.name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(model_file, dest)
                    logger.info(
                        "Verified and downloaded %s v%s to %s",
                        name, model.version, dest,
                    )
                    return dest
                except Exception as e:
                    logger.error("Signature verification failed: %s", e)
                    return None
            else:
                for f in tmp_path.iterdir():
                    if f.suffix in ('.onnx', '.pt', '.gguf'):
                        dest = output_dir / f.name
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(f, dest)
                        return dest
        return None
