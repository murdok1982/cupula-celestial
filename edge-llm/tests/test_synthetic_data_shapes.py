from __future__ import annotations

def test_synthetic_data_tensor_shapes():
    from training.synthetic_data.generator import SyntheticDataset

    ds = SyntheticDataset(num_samples=10, image_size=(224, 224))
    for i in range(len(ds)):
        img, label = ds[i]
        assert img.shape == (3, 224, 224), f"shape esperado (3,224,224), obtenido {img.shape}"
        assert isinstance(label, int)


def test_synthetic_data_batch_shape():
    from training.synthetic_data.generator import SyntheticDataset

    ds = SyntheticDataset(num_samples=32, image_size=(224, 224))
    from torch.utils.data import DataLoader

    loader = DataLoader(ds, batch_size=8)
    batch = next(iter(loader))
    images, labels = batch
    assert images.shape == (8, 3, 224, 224)
    assert labels.shape == (8,)
