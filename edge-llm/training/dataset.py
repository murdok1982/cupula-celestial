"""Dataset PyTorch para el clasificador del dron.

Estructura esperada en disco:
  /datasets/drones/train/<class_name>/*.jpg
  /datasets/drones/val/<class_name>/*.jpg

Clases: las de `pipeline/stage2_classifier.py::CLASSES`.
"""
from __future__ import annotations

from pathlib import Path

try:
    from torch.utils.data import Dataset
except Exception:  # noqa: BLE001
    Dataset = object  # type: ignore[assignment,misc]

from PIL import Image


class DroneDataset(Dataset):  # type: ignore[misc]
    CLASSES = [
        "UNKNOWN",
        "ROTARY_UAV",
        "FIXED_WING_UAV",
        "LOITERING_MUNITION",
        "BIRD",
        "AIRCRAFT_CIVIL",
        "AIRCRAFT_MIL",
        "GROUND_VEHICLE",
        "PERSON",
    ]

    def __init__(self, root: Path, transform=None) -> None:
        self.root = Path(root)
        self.transform = transform
        self.samples: list[tuple[Path, int]] = []
        if not self.root.exists():
            return
        for cls_idx, cls in enumerate(self.CLASSES):
            cls_dir = self.root / cls
            if not cls_dir.exists():
                continue
            for img in cls_dir.glob("*.jpg"):
                self.samples.append((img, cls_idx))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform is not None:
            img = self.transform(img)
        return img, label
