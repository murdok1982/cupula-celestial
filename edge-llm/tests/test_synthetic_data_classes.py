from __future__ import annotations


def test_synthetic_data_all_classes_present():
    from training.synthetic_data.generator import SyntheticDataset

    all_classes = ["ROTARY_UAV", "FIXED_WING_UAV", "LOITERING_MUNITION", "BIRD", "UNKNOWN"]
    ds = SyntheticDataset(num_samples=200, output_size=(224, 224))
    produced = set()
    for i in range(len(ds)):
        sample = ds[i]
        produced.add(sample.class_name)
    assert len(produced) == len(all_classes), (
        f"dataset de 200 muestras deberia cubrir todas las clases, "
        f"faltan: {set(all_classes) - produced}"
    )
