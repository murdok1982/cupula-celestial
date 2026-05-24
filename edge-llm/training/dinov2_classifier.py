"""DINOv2Classifier — backbone DINOv2 + MLP head para clasificación C-UAS.

Soporta:
- DINOv2 small (dinov2_s) y base (dinov2_b) desde torch.hub
- LoRA adapters para fine-tuning eficiente
- Export a ONNX con opset 17 + dynamic axes
- Checkpointing con save_pretrained / from_pretrained
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, ClassVar

try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None  # type: ignore[assignment]
    nn = None

log = logging.getLogger(__name__)

DINOV2_CONFIGS: dict[str, dict[str, Any]] = {
    "dinov2_s": {"name": "dinov2_vits14_reg", "embed_dim": 384, "patch_size": 14},
    "dinov2_b": {"name": "dinov2_vitb14_reg", "embed_dim": 768, "patch_size": 14},
}
RESNET_FALLBACK = "resnet18"


class MLPHead(nn.Module):
    """MLP de 2 capas con dropout para clasificación."""

    def __init__(self, in_dim: int, num_classes: int, hidden_dim: int | None = None, dropout: float = 0.3):
        super().__init__()
        hidden = hidden_dim or in_dim // 2
        self.fc1 = nn.Linear(in_dim, hidden)
        self.gelu = nn.GELU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(hidden, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc2(self.dropout(self.gelu(self.fc1(x))))


class DINOv2Classifier(nn.Module):
    """Clasificador con backbone DINOv2 (congelado) + MLP head fine-tuneable.

    Class Attributes:
        CLASSES: lista global de clases C-UAS.
    """

    CLASSES: ClassVar[list[str]] = [
        "UNKNOWN", "ROTARY_UAV", "FIXED_WING_UAV", "LOITERING_MUNITION",
        "BIRD", "AIRCRAFT_CIVIL", "AIRCRAFT_MIL", "GROUND_VEHICLE", "PERSON",
    ]

    def __init__(
        self,
        backbone: str = "dinov2_s",
        num_classes: int = 9,
        lora_r: int = 0,
        hidden_dim: int | None = None,
        dropout: float = 0.3,
        freeze_backbone: bool = True,
    ):
        super().__init__()
        self.backbone_name = backbone
        self.num_classes = num_classes
        self.freeze_backbone = freeze_backbone
        self.backbone, self.embed_dim = self._load_backbone(backbone)

        if freeze_backbone:
            for p in self.backbone.parameters():
                p.requires_grad_(False)

        self.head = MLPHead(self.embed_dim, num_classes, hidden_dim=hidden_dim, dropout=dropout)

        if lora_r > 0 and "resnet" not in backbone:
            from training.lora import apply_lora_to_dinov2

            apply_lora_to_dinov2(self.backbone, r=lora_r)
            log.info("lora_applied r=%d backbone=%s", lora_r, backbone)

        self._log_trainable()

    def _log_trainable(self) -> None:
        total = sum(p.numel() for p in self.parameters())
        trainable = sum(p.numel() for p in self.parameters() if p.requires_grad)
        frozen = total - trainable
        log.info(
            "dino_classifier_params total=%d trainable=%d frozen=%d backbone=%s",
            total, trainable, frozen, self.backbone_name,
        )

    @staticmethod
    def _load_backbone(backbone: str) -> tuple[nn.Module, int]:
        if backbone in DINOV2_CONFIGS:
            if torch is None:
                raise ImportError("torch needed for DINOv2")
            cfg = DINOV2_CONFIGS[backbone]
            try:
                model = torch.hub.load("facebookresearch/dinov2", cfg["name"])
                log.info("dinov2_loaded backbone=%s embed_dim=%d", backbone, cfg["embed_dim"])
                return model, cfg["embed_dim"]
            except Exception as exc:
                log.warning("dinov2_load_failed %s — fallback to resnet18", exc)
                return DINOv2Classifier._load_resnet18()
        else:
            return DINOv2Classifier._load_resnet18()

    @staticmethod
    def _load_resnet18() -> tuple[nn.Module, int]:
        if torch is None:
            raise ImportError("torch needed for resnet fallback")
        from torchvision.models import resnet18

        model = resnet18(weights=None)
        model.fc = nn.Identity()
        log.info("resnet18_fallback embed_dim=512")
        return model, 512

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if self.backbone_name in DINOV2_CONFIGS:
            # DINOv2 devuelve: [CLS] token o último hidden state
            bs = x.shape[0]
            with torch.set_grad_enabled(not self.freeze_backbone):
                out = self.backbone(x)
            # DINOv2 vits/vitb returns (B, N, D) — tomar cls token (index 0)
            if out.dim() == 3:
                out = out[:, 0, :]  # (B, D)
            elif out.dim() == 2 and out.shape[0] == bs:
                pass
            else:
                out = out.view(bs, -1).mean(dim=1)
        else:
            # ResNet
            with torch.set_grad_enabled(not self.freeze_backbone):
                out = self.backbone(x)
            out = out.view(out.shape[0], -1)
        return self.head(out)

    def export_to_onnx(
        self,
        path: str | Path,
        opset: int = 17,
        input_size: tuple[int, ...] = (1, 3, 224, 224),
    ) -> Path:
        """Exporta el modelo completo (backbone + head) a ONNX.

        Args:
            path: ruta de salida .onnx.
            opset: opset version (default 17).
            input_size: dummy input shape.

        Returns:
            Path del onnx exportado.
        """
        if torch is None:
            raise ImportError("torch needed for ONNX export")
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.eval()
        device = next(self.parameters()).device
        dummy = torch.randn(*input_size, device=device)
        torch.onnx.export(
            self,
            dummy,
            str(path),
            input_names=["input"],
            output_names=["logits"],
            opset_version=opset,
            dynamic_axes={
                "input": {0: "batch_size"},
                "logits": {0: "batch_size"},
            },
        )
        log.info("onnx_exported path=%s opset=%d", path, opset)
        return path

    def save_pretrained(self, path: str | Path) -> Path:
        """Guarda checkpoint completo: state_dict + metadata."""
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        torch.save(self.state_dict(), path / "pytorch_model.bin")
        meta = {
            "backbone": self.backbone_name,
            "num_classes": self.num_classes,
            "freeze_backbone": self.freeze_backbone,
            "embed_dim": self.embed_dim,
        }
        (path / "config.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        log.info("checkpoint_saved path=%s", path)
        return path

    @classmethod
    def from_pretrained(cls, path: str | Path) -> DINOv2Classifier:
        """Carga modelo desde checkpoint guardado con save_pretrained."""
        path = Path(path)
        config_path = path / "config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"config.json not found in {path}")
        meta = json.loads(config_path.read_text(encoding="utf-8"))
        model = cls(
            backbone=meta.get("backbone", "dinov2_s"),
            num_classes=meta.get("num_classes", 9),
            freeze_backbone=meta.get("freeze_backbone", True),
        )
        state = torch.load(path / "pytorch_model.bin", map_location="cpu", weights_only=True)
        model.load_state_dict(state, strict=False)
        log.info("checkpoint_loaded path=%s", path)
        return model

    @property
    def device(self) -> torch.device:
        return next(self.parameters()).device
