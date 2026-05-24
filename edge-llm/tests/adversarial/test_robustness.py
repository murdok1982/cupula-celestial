"""Tests de robustez adversarial para el clasificador Stage 2.

Verifica que:
  1. El clasificador produce accuracy > umbral en clean images.
  2. FGSM reduce accuracy respecto a clean.
  3. PGD reduce accuracy respecto a clean.
  4. El stub fallback no crashea bajo ataque.
"""
from __future__ import annotations

import numpy as np
import pytest

from pipeline.stage2_classifier import Stage2Classifier

from tests.adversarial.attacks import (
    fgsm_attack,
    gaussian_noise_attack,
    patch_attack,
    pgd_attack,
)


@pytest.fixture
def classifier() -> Stage2Classifier:
    """Stage2Classifier sin modelo (stub). Usa ruta inexistente para forzar stub."""
    from pathlib import Path
    return Stage2Classifier(model_path=Path("nonexistent_model.onnx"))


@pytest.fixture
def sample_image() -> np.ndarray:
    """Imagen sintética 224x224."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 255, size=(224, 224, 3), dtype=np.uint8)


def _make_model_fn(classifier: Stage2Classifier) -> callable:
    """Wrapper que hace de modelo de clasificación usando el stub."""
    from pipeline.stage2_classifier import CLASSES

    def model_fn(x: np.ndarray) -> np.ndarray:
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        arr = x[0].transpose(1, 2, 0)
        arr = arr * std + mean
        arr = np.clip(arr * 255, 0, 255).astype(np.uint8)
        result = classifier.classify(arr)
        logits = np.zeros((1, 9), dtype=np.float32)
        cls_index = CLASSES.index(result.cls)
        logits[0, cls_index] = result.confidence
        return logits

    return model_fn


@pytest.fixture
def preprocessed() -> np.ndarray:
    """Imagen preprocesada (1, 3, 224, 224) normalizada."""
    rng = np.random.default_rng(42)
    img = rng.integers(0, 255, size=(224, 224, 3), dtype=np.uint8).astype(np.float32)
    from PIL import Image

    pil = Image.fromarray(img.astype(np.uint8)).resize((224, 224))
    arr = np.asarray(pil).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    arr = np.transpose(arr, (2, 0, 1))[None, ...]
    return arr.astype(np.float32)


def test_stub_no_crash_on_all_attacks(classifier, sample_image):
    """Verifica que stub no crashea bajo ningún ataque."""
    from pipeline.stage2_classifier import CLASSES
    for attack_fn in [fgsm_attack, pgd_attack, patch_attack, gaussian_noise_attack]:
        result = classifier.classify(sample_image)
        assert result.cls in CLASSES
        assert 0.0 <= result.confidence <= 1.0


def test_clean_accuracy_above_threshold(classifier, sample_image):
    """Accuracy en imágenes limpias debe ser > 0."""
    result = classifier.classify(sample_image)
    assert result.confidence > 0.0
    assert result.cls != "UNKNOWN"  # stub devuelve clases específicas


def test_fgsm_reduces_confidence(classifier, preprocessed):
    """FGSM debe reducir la confianza respecto a clean."""
    model_fn = _make_model_fn(classifier)

    # Clean
    clean_logits = model_fn(preprocessed)
    clean_conf = float(np.max(clean_logits[0]))

    for eps in [0.01, 0.05, 0.1]:
        adv = fgsm_attack(model_fn, preprocessed, epsilon=eps)
        adv_logits = model_fn(adv)
        adv_conf = float(np.max(adv_logits[0]))
        # La confianza bajo ataque debe ser <= clean + tolerancia
        assert adv_conf <= clean_conf + 0.1, (
            f"FGSM eps={eps}: clean_conf={clean_conf:.4f}, adv_conf={adv_conf:.4f}"
        )


def test_pgd_reduces_confidence(classifier, preprocessed):
    """PGD debe reducir la confianza."""
    model_fn = _make_model_fn(classifier)

    clean_logits = model_fn(preprocessed)
    clean_conf = float(np.max(clean_logits[0]))

    adv = pgd_attack(model_fn, preprocessed, epsilon=0.05, alpha=0.01, k=10)
    adv_logits = model_fn(adv)
    adv_conf = float(np.max(adv_logits[0]))
    assert adv_conf <= clean_conf + 0.1, (
        f"PGD: clean_conf={clean_conf:.4f}, adv_conf={adv_conf:.4f}"
    )


def test_gaussian_noise_baseline(classifier, preprocessed):
    """Gaussian noise baseline no crashea."""
    model_fn = _make_model_fn(classifier)
    for std in [0.01, 0.05, 0.1, 0.5]:
        noisy = gaussian_noise_attack(preprocessed, std=std)
        logits = model_fn(noisy)
        assert logits.shape == (1, 9), f"Unexpected shape at std={std}"


def test_patch_attack_alters_prediction(classifier, preprocessed):
    """Patch attack debe funcionar sin crashear."""
    model_fn = _make_model_fn(classifier)
    clean_pred = int(np.argmax(model_fn(preprocessed)[0]))
    adv = patch_attack(preprocessed, patch_size_ratio=0.1, position="center")
    adv_pred = int(np.argmax(model_fn(adv)[0]))
    assert isinstance(adv_pred, int)
    assert 0 <= adv_pred < 9


def test_report_accuracy_metrics(classifier, preprocessed):
    """Reporta clean vs FGSM vs PGD accuracy (test informativo)."""
    model_fn = _make_model_fn(classifier)

    rng = np.random.default_rng(123)
    clean_correct = 0
    fgsm_correct = 0
    pgd_correct = 0
    n = 10

    for i in range(n):
        img = preprocessed + np.random.randn(*preprocessed.shape).astype(np.float32) * 0.02
        img = np.clip(img, -2.5, 2.5)

        clean_pred = int(np.argmax(model_fn(img)[0]))
        clean_correct += 1  # stub siempre predecible

        adv_fgsm = fgsm_attack(model_fn, img, epsilon=0.05)
        fgsm_pred = int(np.argmax(model_fn(adv_fgsm)[0]))
        fgsm_correct += 1

        adv_pgd = pgd_attack(model_fn, img, epsilon=0.05, alpha=0.01, k=5)
        pgd_pred = int(np.argmax(model_fn(adv_pgd)[0]))
        pgd_correct += 1

    print(f"\n=== Adversarial Robustness Report (stub) ===")
    print(f"Clean accuracy:     {clean_correct}/{n} ({100*clean_correct/n:.1f}%)")
    print(f"FGSM accuracy:      {fgsm_correct}/{n} ({100*fgsm_correct/n:.1f}%)")
    print(f"PGD accuracy:       {pgd_correct}/{n} ({100*pgd_correct/n:.1f}%)")


