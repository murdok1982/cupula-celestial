"""Augmentations robustas específicas para defensa aérea.

Incluye:
- Motion blur (velocidad angular del dron)
- Gaussian noise (sensor noise)
- Random occlusion (nubes, pájaros)
- Color jitter (condiciones de luz variables)
- Cutout (simular fallo de píxeles)
- Adversarial patch simulado
"""
from __future__ import annotations

import math
import random
from typing import Any, Callable

import numpy as np

try:
    from torchvision import transforms as T
    from torchvision.transforms import functional as F
except ImportError:
    T = None  # type: ignore[assignment]
    F = None


class MotionBlur:
    """Blur direccional simulando movimiento angular del dron."""

    def __init__(self, max_ksize: int = 11, p: float = 0.5):
        self.max_ksize = max_ksize
        self.p = p

    def __call__(self, img: np.ndarray) -> np.ndarray:
        if random.random() > self.p:
            return img
        ksize = random.randrange(3, self.max_ksize + 1, 2)
        angle = random.uniform(0, 180)
        kernel = self._create_motion_kernel(ksize, angle)
        return self._apply_kernel(img, kernel)

    @staticmethod
    def _create_motion_kernel(ksize: int, angle: float) -> np.ndarray:
        kernel = np.zeros((ksize, ksize))
        cx, cy = ksize // 2, ksize // 2
        rad = math.radians(angle)
        for i in range(ksize):
            dx = int(round((i - cx) * math.cos(rad)))
            dy = int(round((i - cx) * math.sin(rad)))
            kx, ky = cx + dx, cy + dy
            if 0 <= kx < ksize and 0 <= ky < ksize:
                kernel[ky, kx] = 1.0
        s = kernel.sum()
        return kernel / s if s > 0 else kernel

    @staticmethod
    def _apply_kernel(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
        from scipy import signal

        ch = []
        for c in range(img.shape[2]):
            ch.append(signal.convolve2d(img[:, :, c], kernel, mode="same", boundary="symm"))
        return np.clip(np.stack(ch, axis=-1), 0, 255).astype(np.uint8)


class GaussianNoise:
    """Ruido gaussiano simulando sensor noise."""

    def __init__(self, std_range: tuple[float, float] = (5.0, 20.0), p: float = 0.5):
        self.std_range = std_range
        self.p = p

    def __call__(self, img: np.ndarray) -> np.ndarray:
        if random.random() > self.p:
            return img
        std = random.uniform(*self.std_range)
        noise = np.random.randn(*img.shape).astype(np.float32) * std
        return np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)


class RandomOcclusion:
    """Oculta regiones simulando nubes, pájaros u otros objetos."""

    def __init__(self, max_blocks: int = 3, max_size_ratio: float = 0.15, p: float = 0.4):
        self.max_blocks = max_blocks
        self.max_size_ratio = max_size_ratio
        self.p = p

    def __call__(self, img: np.ndarray) -> np.ndarray:
        if random.random() > self.p:
            return img
        H, W = img.shape[:2]
        out = img.copy()
        for _ in range(random.randint(1, self.max_blocks)):
            bh = int(H * random.uniform(0.03, self.max_size_ratio))
            bw = int(W * random.uniform(0.03, self.max_size_ratio))
            x = random.randint(0, W - bw)
            y = random.randint(0, H - bh)
            color = (
                random.randint(180, 255),
                random.randint(180, 255),
                random.randint(180, 255),
            )
            out[y : y + bh, x : x + bw] = color
        return out


class AdversarialPatch:
    """Simula un patch adversarial (cuadrado negro/textura en esquina)."""

    def __init__(self, patch_size_ratio: float = 0.08, p: float = 0.3):
        self.patch_size_ratio = patch_size_ratio
        self.p = p

    def __call__(self, img: np.ndarray) -> np.ndarray:
        if random.random() > self.p:
            return img
        H, W = img.shape[:2]
        ps = int(min(H, W) * self.patch_size_ratio)
        out = img.copy()
        # Esquina superior izquierda
        corners = [(0, 0), (W - ps, 0), (0, H - ps), (W - ps, H - ps)]
        cx, cy = random.choice(corners)
        out[cy : cy + ps, cx : cx + ps] = 0  # patch negro
        # A veces patrón de checkerboard
        if random.random() > 0.5:
            for py in range(ps):
                for px in range(ps):
                    if (py // 4 + px // 4) % 2 == 0:
                        out[cy + py, cx + px] = 255
        return out


class Cutout:
    """Cutout: cero regiones rectangulares (simula fallo de píxeles censores)."""

    def __init__(self, max_holes: int = 3, max_size: int = 30, p: float = 0.3):
        self.max_holes = max_holes
        self.max_size = max_size
        self.p = p

    def __call__(self, img: np.ndarray) -> np.ndarray:
        if random.random() > self.p:
            return img
        H, W = img.shape[:2]
        out = img.copy()
        for _ in range(random.randint(1, self.max_holes)):
            bh = random.randint(5, self.max_size)
            bw = random.randint(5, self.max_size)
            x = random.randint(0, W - bw)
            y = random.randint(0, H - bh)
            out[y : y + bh, x : x + bw] = 127  # gris (píxel muerto)
        return out


class Compose:
    """Composición de augmentations numpy-based."""

    def __init__(self, transforms: list[Callable[[np.ndarray], np.ndarray]]):
        self.transforms = transforms

    def __call__(self, img: np.ndarray) -> np.ndarray:
        for t in self.transforms:
            img = t(img)
        return img


def build_robust_augmentations(img_size: int = 224) -> Any:
    """Construye pipeline completo de augmentations.

    Returns:
        torchvision Compose si está disponible, si no Compose numpy.
    """
    numpy_transforms = Compose([
        MotionBlur(max_ksize=9, p=0.4),
        GaussianNoise(std_range=(3.0, 15.0), p=0.4),
        RandomOcclusion(max_blocks=2, max_size_ratio=0.12, p=0.3),
        AdversarialPatch(patch_size_ratio=0.06, p=0.2),
        Cutout(max_holes=2, max_size=25, p=0.3),
    ])

    if T is not None:
        return T.Compose([
            T.Resize((img_size, img_size)),
            T.RandomHorizontalFlip(p=0.3),
            T.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.3, hue=0.1),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
    return numpy_transforms
