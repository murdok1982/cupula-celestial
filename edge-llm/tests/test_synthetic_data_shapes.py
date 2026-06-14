from __future__ import annotations


def test_synthetic_data_tensor_shapes():
    from training.synthetic_data.generator import SyntheticDataset

    ds = SyntheticDataset(num_samples=10, output_size=(224, 224))
    for i in range(len(ds)):
        sample = ds[i]
        assert sample.image.shape[:2] == (224, 224), (
            f"shape esperado (224,224,...), obtenido {sample.image.shape[:2]}"
        )
        assert isinstance(sample.label, int)


def test_synthetic_data_batch_shape():
    from training.synthetic_data.generator import SyntheticDataset

    ds = SyntheticDataset(num_samples=32, output_size=(224, 224))
    samples = [ds[i] for i in range(8)]
    images = [s.image for s in samples]
    labels = [s.label for s in samples]
    import numpy as np

    batch_img = np.stack(images)
    batch_lbl = np.array(labels)
    assert batch_img.shape[0] == 8
    assert batch_img.shape[1:3] == (224, 224)
    assert batch_lbl.shape == (8,)
