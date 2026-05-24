"""Low-Rank Adaptation (LoRA) para DINOv2 ViT backbones.

Implementación ligera que injecta adaptadores en las proyecciones de atención
(query, key, value, output) del transformer. No requiere huggingface PEFT.
"""
from __future__ import annotations

import logging
from typing import Any

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
except ImportError:
    torch = None  # type: ignore[assignment]
    nn = None
    F = None

log = logging.getLogger(__name__)


class LoraLinear(nn.Module):
    """Capa Linear con adaptador LoRA (A·B) en paralelo.

    La capa original se congela y se añade el producto de dos matrices
    de bajo rango: output = original(x) + alpha/r * x @ A^T @ B^T
    """

    def __init__(
        self,
        original: nn.Linear,
        r: int = 8,
        alpha: float = 16.0,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.r = r
        self.alpha = alpha
        self.scaling = alpha / r
        self.original = original
        self.original.requires_grad_(False)

        in_features = original.in_features
        out_features = original.out_features

        self.dropout = nn.Dropout(dropout) if dropout > 0 else nn.Identity()
        self.lora_A = nn.Parameter(torch.empty(r, in_features))
        self.lora_B = nn.Parameter(torch.empty(out_features, r))
        self._reset_parameters()

    def _reset_parameters(self) -> None:
        nn.init.kaiming_uniform_(self.lora_A, a=5**0.5)
        nn.init.zeros_(self.lora_B)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        base = self.original(x)
        lora = (x @ self.lora_A.T) @ self.lora_B.T
        return base + self.dropout(lora) * self.scaling

    def extra_repr(self) -> str:
        return (
            f"r={self.r}, alpha={self.alpha}, "
            f"scaling={self.scaling:.3f}, "
            f"in={self.original.in_features}, "
            f"out={self.original.out_features}"
        )


def _apply_lora_to_module(
    module: nn.Module,
    r: int = 8,
    alpha: float = 16.0,
    dropout: float = 0.1,
    prefix: str = "",
) -> None:
    """Reemplaza recursivamente nn.Linear por LoraLinear en un módulo."""
    for name, child in list(module.named_children()):
        full_name = f"{prefix}.{name}" if prefix else name
        if isinstance(child, nn.Linear):
            lora = LoraLinear(child, r=r, alpha=alpha, dropout=dropout)
            setattr(module, name, lora)
            log.debug("lora_applied %s  in=%d out=%d r=%d", full_name, child.in_features, child.out_features, r)
        else:
            _apply_lora_to_module(child, r=r, alpha=alpha, dropout=dropout, prefix=full_name)


def apply_lora_to_dinov2(
    model: nn.Module,
    r: int = 8,
    alpha: float = 16.0,
    dropout: float = 0.1,
    target_modules: list[str] | None = None,
) -> nn.Module:
    """Aplica LoRA a las capas de atención de DINOv2.

    Args:
        model: DINOv2 model from torch.hub.
        r: LoRA rank.
        alpha: LoRA alpha scaling.
        dropout: dropout probability.
        target_modules: subcadenas para identificar módulos objetivo
            (default: q_proj, k_proj, v_proj, o_proj, proj, fc1, fc2).

    Returns:
        Model with LoRA adapters injected.
    """
    if target_modules is None:
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "proj", "fc1", "fc2"]

    count = 0
    for name, child in model.named_children():
        _apply_lora_recursive(child, r, alpha, dropout, name, target_modules)
    # Recuento
    for param in model.parameters():
        if param.requires_grad:
            count += 1
    log.info("lora_params_requires_grad=%d", count)
    return model


def _apply_lora_recursive(
    module: nn.Module,
    r: int,
    alpha: float,
    dropout: float,
    prefix: str,
    target_modules: list[str],
) -> None:
    for name, child in list(module.named_children()):
        full_name = f"{prefix}.{name}" if prefix else name
        if isinstance(child, nn.Linear) and any(t in full_name for t in target_modules):
            lora = LoraLinear(child, r=r, alpha=alpha, dropout=dropout)
            setattr(module, name, lora)
            log.debug("lora %s  (r=%d)", full_name, r)
        else:
            _apply_lora_recursive(child, r, alpha, dropout, full_name, target_modules)


def lora_state_dict(model: nn.Module) -> dict[str, torch.Tensor]:
    """Extrae solo los parámetros LoRA (lora_A, lora_B) del modelo."""
    state: dict[str, torch.Tensor] = {}
    for name, param in model.named_parameters():
        if "lora_" in name:
            state[name] = param
    return state


def load_lora_state_dict(model: nn.Module, state_dict: dict[str, torch.Tensor]) -> None:
    """Carga solo los pesos LoRA en un modelo."""
    missing, unexpected = model.load_state_dict(state_dict, strict=False)
    if missing:
        log.warning("lora_load missing params (not LoRA, expected): %s", missing[:5])
    if unexpected:
        log.warning("lora_load unexpected params: %s", unexpected[:5])
