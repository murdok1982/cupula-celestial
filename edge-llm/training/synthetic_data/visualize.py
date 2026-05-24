"""Visualización de muestras sintéticas generadas.

Uso:
    python -m training.synthetic_data.visualize --num-samples 16 --output samples_grid.png
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from training.synthetic_data.generator import SyntheticDataset


def make_grid(
    samples: list,
    cols: int = 4,
    cell_size: tuple[int, int] = (320, 320),
) -> Image.Image:
    """Crea un grid de muestras con etiquetas superpuestas."""
    rows = (len(samples) + cols - 1) // cols
    grid_w = cols * cell_size[0]
    grid_h = rows * cell_size[1]
    grid = Image.new("RGB", (grid_w, grid_h), (30, 30, 30))

    try:
        from PIL import ImageDraw, ImageFont

        font = ImageFont.load_default()
    except ImportError:
        ImageDraw = None
        font = None

    for i, sample in enumerate(samples):
        r, c = divmod(i, cols)
        x, y = c * cell_size[0], r * cell_size[1]
        img = Image.fromarray(sample.image).resize(cell_size)

        if ImageDraw and font:
            draw = ImageDraw.Draw(img)
            label = f"{sample.class_name} | {sample.distance}m | {sample.weather}"
            bbox_text = f"bbox: {sample.bbox}"
            draw.text((4, 4), label, fill=(0, 255, 0), font=font)
            draw.text((4, 20), bbox_text, fill=(255, 255, 0), font=font)
            x1, y1, x2, y2 = sample.bbox
            # Escalar al cell_size
            sx = cell_size[0] / sample.image.shape[1]
            sy = cell_size[1] / sample.image.shape[0]
            draw.rectangle([x1 * sx, y1 * sy, x2 * sx, y2 * sy], outline=(255, 0, 0), width=2)

        grid.paste(img, (x, y))

    return grid


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualiza muestras sintéticas C-UAS")
    parser.add_argument("--num-samples", type=int, default=16, help="número de muestras")
    parser.add_argument("--output", type=Path, default=Path("samples_grid.png"), help="ruta de salida")
    parser.add_argument("--output-size", type=int, nargs=2, default=(640, 640), help="H W de las muestras")
    parser.add_argument("--seed", type=int, default=42, help="semilla")
    args = parser.parse_args()

    ds = SyntheticDataset(
        output_size=tuple(args.output_size),
        num_samples=args.num_samples,
        seed=args.seed,
    )
    samples = ds.generate_all()

    grid = make_grid(samples, cols=4)
    grid.save(str(args.output))
    print(f"Grid guardado: {args.output} ({args.num_samples} muestras)")


if __name__ == "__main__":
    main()
