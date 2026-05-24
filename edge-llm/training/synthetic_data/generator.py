"""Generador de datos sintéticos para C-UAS.

Crea imágenes de entrenamiento combinando fondos (cielo, urbano, rural)
con UAVs sintéticos renderizados como primitivas geométricas simples,
simulando condiciones meteorológicas y distancias realistas.

Solo depende de numpy y PIL — sin blender, sin GPU.
"""
from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

log = logging.getLogger(__name__)

BackgroundType = Literal["sky", "urban", "rural", "mixed"]
WeatherType = Literal["clear", "fog", "rain", "glare", "mixed"]
ClassType = Literal["ROTARY_UAV", "FIXED_WING_UAV", "LOITERING_MUNITION", "BIRD"]

# Tamaño aparente de un UAV en píxeles (asumiendo sensor 1080p, FOV ~60°)
# Calculado: px = (tamaño_real_mm * focal_mm) / (distancia_m * sensor_mm)
# Simplificado para imagen 640x640:
UAV_PX_AT_DISTANCE: dict[int, tuple[int, int]] = {
    200: (48, 32),   # cerca, grande
    500: (20, 14),
    1000: (10, 7),
    2000: (5, 3),
}


@dataclass
class DroneSpec:
    cls: ClassType
    color: tuple[int, int, int]
    body_ratio: float  # proporcion cuerpo respecto ancho
    has_wings: bool = False
    is_bird: bool = False


DRONE_SPECS: list[DroneSpec] = [
    DroneSpec("ROTARY_UAV", (60, 60, 60), 0.5, has_wings=False),  # gris oscuro
    DroneSpec("ROTARY_UAV", (180, 180, 180), 0.5, has_wings=False),  # gris claro
    DroneSpec("ROTARY_UAV", (40, 80, 40), 0.5, has_wings=False),  # camuflaje
    DroneSpec("FIXED_WING_UAV", (100, 100, 110), 0.6, has_wings=True),
    DroneSpec("FIXED_WING_UAV", (70, 70, 80), 0.6, has_wings=True),
    DroneSpec("LOITERING_MUNITION", (50, 50, 55), 0.4, has_wings=True),
    DroneSpec("BIRD", (140, 100, 80), 0.3, has_wings=True, is_bird=True),
    DroneSpec("BIRD", (80, 80, 90), 0.3, has_wings=True, is_bird=True),
]


@dataclass
class SyntheticSample:
    image: np.ndarray  # HxWxC uint8
    label: int
    class_name: str
    distance: int
    weather: str
    bbox: tuple[int, int, int, int]  # x1, y1, x2, y2


class SyntheticDataset:
    """Generador de dataset sintético C-UAS.

    Args:
        output_size: (H, W) de las imágenes generadas.
        num_samples: número total de muestras a generar.
        classes: lista de clases a incluir (None = todas).
        weather: condición meteorológica.
        distance_range: tupla (min, max) distancia en metros.
        background_type: tipo de fondo.
        seed: semilla RNG.
    """

    def __init__(
        self,
        output_size: tuple[int, int] = (640, 640),
        num_samples: int = 100,
        classes: list[str] | None = None,
        weather: WeatherType = "mixed",
        distance_range: tuple[int, int] = (200, 2000),
        background_type: BackgroundType = "mixed",
        seed: int = 42,
    ):
        self.output_size = output_size
        self.num_samples = num_samples
        self.weather = weather
        self.distance_range = distance_range
        self.background_type = background_type
        self.rng = random.Random(seed)
        self.np_rng = np.random.default_rng(seed)

        all_classes = ["ROTARY_UAV", "FIXED_WING_UAV", "LOITERING_MUNITION", "BIRD", "UNKNOWN"]
        self.classes = classes if classes else all_classes
        self.samples: list[SyntheticSample] = []

    def __len__(self) -> int:
        return self.num_samples

    def __getitem__(self, idx: int) -> SyntheticSample:
        return self._generate_one()

    def generate_all(self) -> list[SyntheticSample]:
        """Genera todas las muestras del dataset."""
        self.samples = [self._generate_one() for _ in range(self.num_samples)]
        log.info("synthetic_generated count=%d weather=%s bg=%s", self.num_samples, self.weather, self.background_type)
        return self.samples

    def save_to_disk(self, root: Path, split: str = "train") -> None:
        """Guarda las muestras en disco en formato DroneDataset:
        root/split/<class>/*.jpg
        """
        if not self.samples:
            self.generate_all()
        for i, sample in enumerate(self.samples):
            cls_dir = root / split / sample.class_name
            cls_dir.mkdir(parents=True, exist_ok=True)
            Image.fromarray(sample.image).save(cls_dir / f"syn_{i:06d}.jpg", quality=90)
        log.info("synthetic_saved root=%s split=%s count=%d", root, split, len(self.samples))

    def _generate_one(self) -> SyntheticSample:
        H, W = self.output_size

        # Fondo
        bg_type = self._pick_background()
        bg = self._generate_background(bg_type, H, W)

        # Clase y distancia
        cls_name = self.rng.choice(self.classes)
        if cls_name == "UNKNOWN":
            # Fondo solo, sin dron
            weather = self._pick_weather()
            img = self._apply_weather(bg, weather)
            return SyntheticSample(img, self.classes.index("UNKNOWN"), "UNKNOWN", 0, weather, (0, 0, 0, 0))

        distance = self.rng.randint(*self.distance_range)
        drone_specs = [d for d in DRONE_SPECS if d.cls == cls_name]
        spec = self.rng.choice(drone_specs) if drone_specs else DRONE_SPECS[0]

        px_w, px_h = self._size_at_distance(distance)
        px_w = max(4, int(px_w * self.rng.uniform(0.7, 1.3)))
        px_h = max(4, int(px_h * self.rng.uniform(0.7, 1.3)))

        # Posición aleatoria en el cielo (mitad superior)
        x = self.rng.randint(px_w, W - px_w)
        y = self.rng.randint(px_h, H // 2)

        # Renderizar dron
        drone_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self._render_drone(drone_layer, spec, x, y, px_w, px_h)

        # Componer
        bg_pil = Image.fromarray(bg).convert("RGBA")
        composed = Image.alpha_composite(bg_pil, drone_layer)
        img_rgb = np.asarray(composed.convert("RGB"))

        # Clima
        weather = self._pick_weather()
        img_rgb = self._apply_weather(img_rgb, weather)

        bbox = (x - px_w // 2, y - px_h // 2, x + px_w // 2, y + px_h // 2)
        return SyntheticSample(
            img_rgb,
            self.classes.index(cls_name),
            cls_name,
            distance,
            weather,
            bbox,
        )

    def _pick_background(self) -> BackgroundType:
        if self.background_type == "mixed":
            return self.rng.choice(["sky", "urban", "rural"])
        return self.background_type

    def _pick_weather(self) -> str:
        if self.weather == "mixed":
            return self.rng.choice(["clear", "fog", "rain", "glare"])
        return self.weather

    def _generate_background(self, bg_type: BackgroundType, H: int, W: int) -> np.ndarray:
        """Genera fondos procedurales."""
        if bg_type == "sky":
            return self._sky_background(H, W)
        if bg_type == "urban":
            return self._urban_background(H, W)
        return self._rural_background(H, W)

    def _sky_background(self, H: int, W: int) -> np.ndarray:
        """Degradado cielo azul + nubes."""
        img = np.zeros((H, W, 3), dtype=np.uint8)
        for y in range(H):
            t = y / H
            r = int(135 + 100 * t)
            g = int(180 + 50 * t)
            b = int(235 - 30 * t)
            img[y, :] = [r, g, b]
        # Nubes
        for _ in range(self.rng.randint(3, 6)):
            cx = self.rng.randint(0, W)
            cy = self.rng.randint(0, H // 2)
            r = self.rng.randint(30, 80)
            for dy in range(-r, r):
                for dx in range(-r, r):
                    if dx * dx + dy * dy < r * r * self.rng.uniform(0.5, 1.0):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H:
                            img[ny, nx] = np.clip(img[ny, nx].astype(int) + 40, 0, 255).astype(np.uint8)
        return img

    def _urban_background(self, H: int, W: int) -> np.ndarray:
        """Edificios + cielo."""
        img = self._sky_background(H, W)
        draw = ImageDraw.Draw(Image.fromarray(img))
        for _ in range(self.rng.randint(5, 12)):
            bx = self.rng.randint(0, W)
            bw = self.rng.randint(30, 120)
            bh = self.rng.randint(60, H // 2)
            by = H - bh
            gray = self.rng.randint(60, 150)
            draw.rectangle([bx, by, bx + bw, H], fill=(gray, gray, gray))
            # Ventanas
            for wy in range(by + 5, H - 5, 15):
                for wx in range(bx + 5, bx + bw - 5, 15):
                    if self.rng.random() > 0.4:
                        win_bright = self.rng.randint(180, 255)
                        draw.rectangle([wx, wy, wx + 6, wy + 6], fill=(win_bright, win_bright, 200))
        return np.asarray(img)

    def _rural_background(self, H: int, W: int) -> np.ndarray:
        """Cielo + tierra/vegetación."""
        img = np.zeros((H, W, 3), dtype=np.uint8)
        horizon = H // 2 + self.rng.randint(-30, 30)
        # Cielo
        for y in range(horizon):
            t = y / max(1, horizon)
            img[y, :] = [int(135 + 80 * t), int(180 + 40 * t), int(235 - 20 * t)]
        # Tierra
        for y in range(horizon, H):
            t = (y - horizon) / max(1, H - horizon)
            g = int(100 + 60 * t)
            img[y, :] = [int(50 + 20 * t), g, int(30 + 10 * t)]
        # Árboles
        draw = ImageDraw.Draw(Image.fromarray(img))
        for _ in range(self.rng.randint(3, 8)):
            tx = self.rng.randint(0, W)
            ty = horizon - self.rng.randint(10, 40)
            tr = self.rng.randint(10, 30)
            green = self.rng.randint(40, 120)
            draw.ellipse([tx - tr, ty - tr, tx + tr, ty + tr], fill=(20, green, 15))
        return np.asarray(img)

    def _render_drone(self, layer: Image.Image, spec: DroneSpec, cx: int, cy: int, pw: int, ph: int) -> None:
        """Renderiza un dron como primitivas geométricas."""
        draw = ImageDraw.Draw(layer)
        color = spec.color + (220,)

        if spec.is_bird:
            self._render_bird(draw, cx, cy, pw, ph, color)
        elif spec.has_wings:
            self._render_fixed_wing(draw, cx, cy, pw, ph, color, spec.cls)
        else:
            self._render_rotary(draw, cx, cy, pw, ph, color)

    def _render_rotary(self, draw: ImageDraw, cx: int, cy: int, pw: int, ph: int, color: tuple[int, int, int, int]) -> None:
        """Cuadricóptero: cuerpo central + 4 brazos."""
        body_w = max(3, pw // 2)
        body_h = max(3, ph // 2)
        draw.ellipse([cx - body_w // 2, cy - body_h // 2, cx + body_w // 2, cy + body_h // 2], fill=color)
        # Brazos
        arm_len = pw // 2
        for dx, dy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            ex = cx + dx * arm_len
            ey = cy + dy * arm_len
            draw.line([(cx, cy), (ex, ey)], fill=(80, 80, 80, 200), width=max(1, pw // 10))
            # Rotor
            rotor_r = max(2, pw // 5)
            draw.ellipse([ex - rotor_r, ey - rotor_r, ex + rotor_r, ey + rotor_r], fill=(150, 150, 150, 180))

    def _render_fixed_wing(self, draw: ImageDraw, cx: int, cy: int, pw: int, ph: int, color: tuple[int, int, int, int], cls: str) -> None:
        """Ala fija: fuselaje + alas."""
        # Fuselaje
        fw = max(3, pw // 3)
        fh = max(4, ph)
        draw.ellipse([cx - fw // 2, cy - fh // 2, cx + fw // 2, cy + fh // 2], fill=color)
        # Alas
        wing_w = pw // 2
        wing_h = max(2, ph // 4)
        draw.rectangle([cx - wing_w, cy - wing_h, cx - fw // 2, cy + wing_h], fill=(color[0] - 20, color[1] - 20, color[2] - 20, 200))
        draw.rectangle([cx + fw // 2, cy - wing_h, cx + wing_w, cy + wing_h], fill=(color[0] - 20, color[1] - 20, color[2] - 20, 200))
        # Cola
        draw.polygon([(cx, cy + fh // 2), (cx - pw // 6, cy + fh), (cx + pw // 6, cy + fh)], fill=color)

    def _render_bird(self, draw: ImageDraw, cx: int, cy: int, pw: int, ph: int, color: tuple[int, int, int, int]) -> None:
        """Pájaro: silueta simple con alas."""
        body_color = (color[0] + 40, color[1] + 20, color[2], 220)
        draw.ellipse([cx - pw // 4, cy - ph // 4, cx + pw // 4, cy + ph // 4], fill=body_color)
        # Alas
        draw.arc([cx - pw // 2, cy - ph, cx, cy], 180, 360, fill=(100, 80, 70, 180), width=max(1, pw // 8))
        draw.arc([cx, cy - ph, cx + pw // 2, cy], 180, 360, fill=(100, 80, 70, 180), width=max(1, pw // 8))

    @staticmethod
    def _size_at_distance(distance_m: int) -> tuple[int, int]:
        """Calcula tamaño aparente (px) según distancia."""
        dists = sorted(UAV_PX_AT_DISTANCE.keys())
        if distance_m <= dists[0]:
            return UAV_PX_AT_DISTANCE[dists[0]]
        if distance_m >= dists[-1]:
            return UAV_PX_AT_DISTANCE[dists[-1]]
        for i in range(len(dists) - 1):
            d1, d2 = dists[i], dists[i + 1]
            if d1 <= distance_m <= d2:
                frac = (distance_m - d1) / (d2 - d1)
                w1, h1 = UAV_PX_AT_DISTANCE[d1]
                w2, h2 = UAV_PX_AT_DISTANCE[d2]
                return (int(w1 + (w2 - w1) * frac), int(h1 + (h2 - h1) * frac))
        return (10, 7)

    def _apply_weather(self, img: np.ndarray, weather: str) -> np.ndarray:
        """Aplica condiciones meteorológicas a la imagen."""
        H, W = img.shape[:2]
        if weather == "clear":
            return img
        if weather == "fog":
            fog = np.full_like(img, 200, dtype=np.uint8)
            alpha = self.rng.uniform(0.2, 0.5)
            return np.clip(img.astype(float) * (1 - alpha) + fog.astype(float) * alpha, 0, 255).astype(np.uint8)
        if weather == "rain":
            rain = img.copy()
            for _ in range(self.rng.randint(50, 150)):
                rx = self.rng.randint(0, W)
                ry = self.rng.randint(0, H)
                rl = self.rng.randint(5, 20)
                for i in range(rl):
                    if 0 <= ry + i < H and 0 <= rx + i // 2 < W:
                        rain[ry + i, min(W - 1, rx + i // 2)] = np.clip(
                            rain[ry + i, min(W - 1, rx + i // 2)].astype(int) + 100, 0, 255
                        ).astype(np.uint8)
            return rain
        if weather == "glare":
            glare = img.copy()
            gx = self.rng.randint(W // 4, 3 * W // 4)
            gy = self.rng.randint(0, H // 3)
            for dy in range(-60, 60):
                for dx in range(-60, 60):
                    d = math.sqrt(dx * dx + dy * dy)
                    if d < 60:
                        intensity = max(0, int(200 * (1 - d / 60)))
                        if 0 <= gy + dy < H and 0 <= gx + dx < W:
                            glare[gy + dy, gx + dx] = np.clip(
                                glare[gy + dy, gx + dx].astype(int) + intensity, 0, 255
                            ).astype(np.uint8)
            return glare
        return img
