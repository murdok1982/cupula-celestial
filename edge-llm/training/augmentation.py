"""Transformaciones para entrenamiento del clasificador.

Adversarial: simulación de camuflaje (cutmix), oclusión (random erase),
variación de iluminación y blur por movimiento.
"""
from __future__ import annotations


def build_train_transforms():
    try:
        from torchvision import transforms
    except ImportError:
        return None
    return transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomResizedCrop(224, scale=(0.6, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=5)], p=0.3),
        transforms.ToTensor(),
        transforms.RandomErasing(p=0.4, scale=(0.02, 0.2)),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def build_val_transforms():
    try:
        from torchvision import transforms
    except ImportError:
        return None
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
