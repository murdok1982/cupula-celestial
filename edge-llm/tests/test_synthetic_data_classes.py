from __future__ import annotations

def test_synthetic_data_all_classes_present():
    from training.synthetic_data.generator import (
        CLASSES,
        SyntheticDataset,
    )

    ds = SyntheticDataset(num_samples=200, image_size=(224, 224))
    produced = set()
    for i in range(len(ds)):
        _, label = ds[i]
        produced.add(label)
    assert len(produced) == len(CLASSES), (
        f"dataset de 200 muestras deberia cubrir todas las clases, "
        f"faltan: {set(range(len(CLASSES))) - produced}"
    )
