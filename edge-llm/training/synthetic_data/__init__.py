"""Pipeline de datos sintéticos para entrenamiento del clasificador C-UAS.

Genera fondos de cielo/urbano/rural con UAVs sintéticos, variaciones
meteorológicas y aumentaciones adversariales para defensa aérea.
"""
from __future__ import annotations

from training.synthetic_data.generator import SyntheticDataset
from training.synthetic_data.augmentations import build_robust_augmentations

__all__ = ["SyntheticDataset", "build_robust_augmentations"]
