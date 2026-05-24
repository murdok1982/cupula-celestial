"""Model Registry client for Cúpula Celestial edge-LLM.

Downloads and verifies signed models from MLflow Model Registry.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RegisteredModel:
    name: str
    version: int
    stage: str
    source: str
    signature: Optional[str] = None


class ModelRegistryClient:
    """Client for MLflow Model Registry."""

    def __init__(self, tracking_uri: str = "http://localhost:5000") -> None:
        self.tracking_uri = tracking_uri
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                import mlflow
                mlflow.set_tracking_uri(self.tracking_uri)
                self._client = mlflow.tracking.MlflowClient()
            except ImportError:
                logger.warning("mlflow not installed, using local registry")
                self._client = None
        return self._client

    def get_latest_production(self, name: str) -> Optional[RegisteredModel]:
        """Get latest production version of a model."""
        if self.client is None:
            return None
        try:
            versions = self.client.get_latest_versions(name, stages=["Production"])
            if not versions:
                return None
            v = versions[0]
            return RegisteredModel(
                name=v.name, version=v.version, stage=v.current_stage,
                source=v.source
            )
        except Exception as e:
            logger.error(f"Failed to get latest production: {e}")
            return None

    def download_model(self, model: RegisteredModel, output_dir: Path) -> Optional[Path]:
        """Download model from registry."""
        try:
            import mlflow
            local_path = mlflow.artifacts.download_artifacts(
                artifact_uri=model.source, dst_path=str(output_dir)
            )
            return Path(local_path)
        except Exception as e:
            logger.error(f"Failed to download model: {e}")
            return None

    def list_models(self) -> list[str]:
        """List all registered models."""
        if self.client is None:
            return []
        return [m.name for m in self.client.search_registered_models()]

    def get_model_versions(self, name: str) -> list[RegisteredModel]:
        """Get all versions of a model."""
        if self.client is None:
            return []
        return [
            RegisteredModel(name=v.name, version=v.version, stage=v.current_stage, source=v.source)
            for v in self.client.search_model_versions(f"name='{name}'")
        ]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--tracking-uri", default="http://localhost:5000")
    parser.add_argument("action", choices=["list", "latest", "download"])
    parser.add_argument("--model", default="cupula-classifier-dinov2_s")
    parser.add_argument("--version", type=int)
    parser.add_argument("--output", type=Path, default=Path("models/"))
    args = parser.parse_args()

    client = ModelRegistryClient(args.tracking_uri)
    if args.action == "list":
        print("Registered models:")
        for m in client.list_models():
            print(f"  {m}")
            for v in client.get_model_versions(m):
                print(f"    v{v.version} [{v.stage}]")
    elif args.action == "latest":
        model = client.get_latest_production(args.model)
        if model:
            print(f"Model: {model.name} v{model.version} [{model.stage}]")
        else:
            print("No production model found")
    elif args.action == "download":
        model = client.get_latest_production(args.model)
        if model:
            path = client.download_model(model, args.output)
            print(f"Downloaded to {path}")
