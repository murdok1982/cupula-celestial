"""WTA local del decision-engine.

El swarm-controller tiene el WTA Húngaro definitivo en Rust. El decision-engine
proponen interceptores candidatos como heurística para que el LLM justifique
y el HMI muestre opciones rápidamente. La asignación final es del swarm-controller.
"""
from __future__ import annotations


def heuristic_select(
    available: list[str],
    target_priority: int = 5,
    min_needed: int = 2,
) -> list[str]:
    if not available:
        return []
    k = min(min_needed if target_priority >= 7 else 1, len(available))
    return available[:k]
