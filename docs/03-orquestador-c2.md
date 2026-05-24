# 03 — Orquestador C2 (el "cerebro")

El orquestador es el núcleo del sistema. Su diseño combina **algoritmos
determinísticos auditables** (fusión, asignación) con **modelos ML** (clasificación,
recomendación táctica) que el operador puede inspeccionar y anular.

## Subsistemas

### 3.1 Track manager (fusión multisensor)

**Algoritmo principal:** Joint Probabilistic Data Association Filter (JPDAF) con
respaldo de Multiple Hypothesis Tracker (MHT) para escenarios saturados.

**Filtros de movimiento:** Interacting Multiple Model (IMM) con 3 modos:
- CV (constant velocity) — vuelo crucero
- CA (constant acceleration) — maniobra
- CT (coordinated turn) — viraje

**Asociación medida-pista:** distancia de Mahalanobis + GNN/Auction algorithm.

**Implementación:** Rust con `nalgebra` y `nalgebra-glm`. ~2.000 LOC, 100 % testable.

### 3.2 Threat classifier

Pipeline ensemble:

```
detection ─┬─→ CNN micro-Doppler (radar)    ┐
           ├─→ EfficientNet-B0 (EO/IR)      ├─→ stacking → XGBoost → score
           ├─→ MLP firma espectral (RF)     │
           └─→ reglas físicas (velocidad,   ┘
                altitud, perfil cinemático)
```

**Categorías:**
- DESCONOCIDO (no clasificable, requiere más sensores)
- AVE (fauna, descartar)
- CIVIL (UAV registrado por matrícula remota EASA U-space)
- MILITAR_AMIGO (transpondedor IFF Mode 5 válido)
- MILITAR_NEUTRAL
- AMENAZA_PROBABLE
- HOSTIL_CONFIRMADO

**Calibración:** umbrales ajustables por ROE y nivel de alerta (DEFCON-like).

### 3.3 Weapon-Target Assignment (WTA)

Problema clásico de asignación. Formulación como ILP:

```
minimize  Σ_ij c_ij * x_ij
subject to:
  Σ_j x_ij ≤ 1    (cada arma asignada a ≤1 objetivo)
  Σ_i x_ij ≥ k_j  (cada objetivo cubierto por ≥k_j armas según valor)
  x_ij ∈ {0,1}

c_ij = α·tiempo_intercept_ij + β·(1−Pk_ij) + γ·munición_usada
```

**Resolución:**
- < 32 pistas / 64 efectores: algoritmo húngaro (Kuhn-Munkres), <50 ms.
- Escenarios mayores: relajación LP + rounding o solver MIP (CBC, HiGHS).
- Modo emergencia: heurística greedy con prioridad por TTI (time-to-impact).

### 3.4 Engagement recommender (LLM táctico)

Un **LLM pequeño** (8B–13B parámetros) corriendo en el servidor C2 con RAG sobre:
- Reglas de Enfrentamiento vigentes
- Manuales doctrinales (TTPs)
- Histórico de incidentes etiquetados
- Geografía y zonas vetadas (escuelas, hospitales, embajadas)

**Modelos candidatos** (auto-hospedados, sin nube extranjera):
- **Llama-3.1-8B-Instruct** cuantizado Q5_K_M (≈6 GB VRAM)
- **Mistral-Nemo-12B** Q4 (≈8 GB)
- **Qwen2.5-14B-Instruct** Q4 (≈9 GB) — buena trazabilidad
- Fine-tuning con dataset propio de doctrina española/OTAN (LoRA)

**Salida estructurada (JSON Schema enforcement):**

```json
{
  "track_id": "T-4471",
  "recommendation": "ENGAGE",
  "interceptors_proposed": ["I-12", "I-19"],
  "engagement_window": {"start_ms": 0, "end_ms": 4200},
  "pk_estimated": 0.89,
  "collateral_risk": "LOW",
  "rationale": "Trayectoria balística hacia activo crítico C-3. Sin amigos en línea de fuego. ROE-7 permite engagement automático.",
  "operator_action_required": true,
  "authorization_level": "OPS-OFFICER"
}
```

El LLM **NUNCA** ejecuta acciones. Solo emite recomendaciones que el operador
acepta, modifica o rechaza. Toda interacción queda registrada.

### 3.5 Operator HMI

- **Cesium 3D** geoespacial con capas tácticas (NATO APP-6/MIL-STD-2525).
- **Vista de pistas** ordenadas por TTI y prioridad.
- **Feeds de vídeo** WebRTC de cada interceptor desplegado.
- **Panel de recomendación** con explicación textual del LLM.
- **Autorización doble-factor:** PIN + huella biométrica + token físico FIDO2.
- **Modo daltónico, modo noche, accesibilidad MIL-STD-1472.**

### 3.6 Audit log inmutable

Toda decisión, dato sensor, autorización y orden cinética → log firmado con
cadena de hash tipo Merkle, exportable como evidencia forense (formato STANAG
4774/4778 para etiquetado de seguridad).

Cumplimiento:
- Reglamento (UE) 2024/1689 (AI Act) — sistema de alto riesgo categoría
  Anexo III §6 (uso militar específicamente excluido del AI Act, pero adoptamos
  sus principios como buena práctica).
- Convenio sobre Ciertas Armas Convencionales (CCAC) — trazabilidad MHC.
