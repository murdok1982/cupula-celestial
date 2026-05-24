"""Ataques adversariales para evaluar robustez del clasificador C-UAS.

Implementaciones ligeras que funcionan con el pipeline edge-llm existente
(aceptan numpy arrays, devuelven numpy arrays). No requieren torch.
"""
from __future__ import annotations

import math
from typing import Callable

import numpy as np


def fgsm_attack(
    model_fn: Callable[[np.ndarray], np.ndarray],
    image: np.ndarray,
    epsilon: float = 0.05,
    targeted: bool = False,
    target_label: int | None = None,
) -> np.ndarray:
    """Fast Gradient Sign Method (FGSM) attack.

    Args:
        model_fn: función que recibe (1, C, H, W) float32 y devuelve logits (1, N).
        image: tensor imagen (1, C, H, W) float32, normalizada.
        epsilon: magnitud del ataque.
        targeted: si es targeted, minimiza pérdida hacia target_label.
        target_label: clase objetivo (requerido si targeted=True).

    Returns:
        Imagen adversarial (1, C, H, W) float32.
    """
    image = image.copy()
    image = _to_float32(image)
    image.reshape(1, -1)  # ensure contiguous

    # Forward + backward aproximado via finite differences numéricas
    # FGSM real requiere gradientes — aquí usamos aproximación numérica
    # para mantener compatibilidad con modelos onnx/numpy sin autograd.
    logits = model_fn(image)
    pred_label = int(np.argmax(logits[0]))

    if targeted and target_label is not None:
        target = target_label
    else:
        target = pred_label

    # Estimación numérica del gradiente via diferencia finita central
    grad = _numerical_grad(model_fn, image, target, targeted)
    sign = np.sign(grad)

    if targeted:
        perturbacion = -epsilon * sign
    else:
        perturbacion = epsilon * sign

    adv = image + perturbacion
    # Clip para mantener en rango [0,1] después de normalización
    return np.clip(adv, -2.5, 2.5)


def pgd_attack(
    model_fn: Callable[[np.ndarray], np.ndarray],
    image: np.ndarray,
    epsilon: float = 0.05,
    alpha: float = 0.01,
    k: int = 20,
    targeted: bool = False,
    target_label: int | None = None,
) -> np.ndarray:
    """Projected Gradient Descent (PGD) attack.

    Args:
        model_fn: función logits.
        image: (1, C, H, W) float32.
        epsilon: radio del ataque L-inf.
        alpha: step size.
        k: número de iteraciones.
        targeted: targeted si True.
        target_label: clase objetivo.

    Returns:
        Imagen adversarial.
    """
    original = image.copy()
    adv = image.copy()

    for _ in range(k):
        grad = _numerical_grad(model_fn, adv, target_label, targeted)
        sign = np.sign(grad)

        if targeted:
            adv = adv - alpha * sign
        else:
            adv = adv + alpha * sign

        # Proyección al epsilon-ball
        diff = adv - original
        diff = np.clip(diff, -epsilon, epsilon)
        adv = original + diff
        adv = np.clip(adv, -2.5, 2.5)

    return adv


def patch_attack(
    image: np.ndarray,
    patch_size_ratio: float = 0.1,
    position: str = "center",
) -> np.ndarray:
    """Ataque de patch: cuadrado negro en región de interés.

    Args:
        image: (1, C, H, W) float32.
        patch_size_ratio: proporción del lado del patch respecto a la imagen.
        position: 'center', 'top_left', 'top_right', 'bottom_left', 'bottom_right'.

    Returns:
        Imagen con patch adversarial.
    """
    adv = image.copy()
    _, _, H, W = adv.shape

    ps_h = max(1, int(H * patch_size_ratio))
    ps_w = max(1, int(W * patch_size_ratio))

    positions = {
        "center": (W // 2 - ps_w // 2, H // 2 - ps_h // 2),
        "top_left": (0, 0),
        "top_right": (W - ps_w, 0),
        "bottom_left": (0, H - ps_h),
        "bottom_right": (W - ps_w, H - ps_h),
    }
    px, py = positions.get(position, positions["center"])

    adv[:, :, py : py + ps_h, px : px + ps_w] = -1.0  # muy oscuro
    return adv


def gaussian_noise_attack(
    image: np.ndarray,
    std: float = 0.1,
) -> np.ndarray:
    """Gaussian noise baseline.

    Args:
        image: (1, C, H, W) float32.
        std: desviación estándar del ruido.

    Returns:
        Imagen con ruido gaussiano.
    """
    noise = np.random.randn(*image.shape).astype(np.float32) * std
    return np.clip(image + noise, -2.5, 2.5)


def _to_float32(x: np.ndarray) -> np.ndarray:
    return x.astype(np.float32)


def _numerical_grad(
    model_fn: Callable[[np.ndarray], np.ndarray],
    image: np.ndarray,
    target_label: int | None,
    targeted: bool,
    h: float = 1e-3,
) -> np.ndarray:
    """Aproximación numérica del gradiente via diferencia finita central."""
    grad = np.zeros_like(image, dtype=np.float32)
    flat = image.flatten()
    n = len(flat)
    # Eficiencia: sampleamos un subconjunto de píxeles para no ser O(n)
    # En producción real usar torch.autograd
    stride = max(1, n // 100)  # ~100 píxeles
    for i in range(0, n, stride):
        orig = flat[i].copy()
        flat[i] = orig + h
        loss_plus = model_fn(flat.reshape(image.shape))[0]
        flat[i] = orig - h
        loss_minus = model_fn(flat.reshape(image.shape))[0]
        flat[i] = orig

        if targeted and target_label is not None:
            # Minimizar pérdida: grad = -d(loss)/dx
            grad.flat[i] = -(loss_plus[target_label] - loss_minus[target_label]) / (2 * h)
        else:
            # Maximizar pérdida: grad = d(loss)/dx
            pred = int(np.argmax(loss_plus))
            grad.flat[i] = (loss_plus[pred] - loss_minus[pred]) / (2 * h)

    return grad
