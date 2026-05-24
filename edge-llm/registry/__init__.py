"""Model Registry client for Cúpula Celestial edge-LLM.

Proporciona acceso al MLflow Model Registry para descargar,
verificar y gestionar modelos firmados en el ecosistema C-UAS.
"""

from registry.client import ModelRegistryClient, RegisteredModel
from registry.signed_registry import SignedRegistryClient

__all__ = [
    "ModelRegistryClient",
    "RegisteredModel",
    "SignedRegistryClient",
]
