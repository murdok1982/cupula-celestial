# 04 — Edge LLM / VLM en el dron

## Restricción física

Un dron interceptor pequeño tiene un presupuesto severísimo:

| Recurso | Presupuesto típico |
|---------|--------------------|
| Peso del cómputo | < 150 g (incluyendo disipador) |
| Consumo | < 15 W sostenido (autonomía 20 min) |
| Latencia decisión | < 100 ms por inferencia visual |
| Memoria | 4–8 GB LPDDR5 |
| Temperatura operativa | −20 °C a +60 °C |
| Robustez | MIL-STD-810H (vibración, choque, humedad) |

**Conclusión**: no cabe un LLM monolítico de 70B. Hay que componer un **sistema
de modelos especializados** sobre un VLM compacto.

## Hardware embarcado recomendado

**Opción A (premium, alta capacidad):**
- **NVIDIA Jetson Orin Nano 8GB** (módulo SoM)
  - 40 TOPS INT8, 7–15 W, 1024 CUDA + 32 Tensor Cores
  - ~$500 unidad en volumen, ~70 g con disipador
  - Soporte TensorRT, ONNX Runtime, Triton

**Opción B (eficiencia energética):**
- **Hailo-8 + Raspberry Pi CM5** o **Hailo-8L** (M.2 form factor)
  - 26 TOPS / 13 TOPS, 2,5 W
  - Excepcional para detección, limitado para VLM grande
  - ~$250 unidad

**Opción C (futura, soberana):**
- SoC español/europeo de cómputo neuronal (ESCAPE-2 del INTA, proyectos PERTE Chip)
- Horizonte 2027–2028

## Modelo de lenguaje-visión (VLM) embarcado

**Filosofía:** NO se busca un "LLM conversacional" en el dron. Se busca un VLM
que en ≤100 ms responda con `JSON {target_present, class, confidence, ifff_marks, civilian_proximity}`
sobre el frame de cámara.

### Modelos candidatos (rango ≤3B parámetros)

| Modelo | Params | VRAM (Q4) | Latencia Jetson Orin Nano | Notas |
|--------|--------|-----------|---------------------------|-------|
| **Moondream2** | 1,86B | 1,8 GB | ~80 ms | Buen balance, licencia Apache 2.0 |
| **Florence-2-base** | 0,23B | 0,5 GB | ~25 ms | Microsoft, MIT. Detección + caption |
| **PaliGemma-3B-mix** | 3B | 2,4 GB | ~120 ms | Google, fuerte zero-shot |
| **MobileVLM-V2-1.7B** | 1,7B | 1,5 GB | ~70 ms | Optimizado para móvil |
| **SmolVLM-256M** | 0,26B | 0,3 GB | ~15 ms | Hugging Face, extremo ligero |
| **InternVL2-1B** | 1B | 1 GB | ~50 ms | Excelente reconocimiento |

**Recomendación: pipeline en cascada (hybrid)**

```
Frame cámara (30 FPS)
    │
    ▼
┌─────────────────────────────┐
│ Stage 1: YOLOv9-tiny / RT-DETR-S│  ~10 ms,  detección genérica de objetos
│ (TensorRT INT8)             │
└──────────┬──────────────────┘
           │  hay objeto candidato?
           ▼  sí
┌─────────────────────────────┐
│ Stage 2: clasificador propio │  ~5 ms,  CNN fine-tuned con dataset
│ (dron amigo/enemigo/civil)  │           interno (drones objetivo y aliados)
└──────────┬──────────────────┘
           │  ambiguo o objetivo confirmado?
           ▼
┌─────────────────────────────┐
│ Stage 3: VLM (Moondream2)   │  ~80 ms,  verificación semántica
│  prompt: "¿es un UAV        │           "Hay marcas IFF? ¿bandera?
│  hostil? ¿hay civiles cerca?│           ¿personal civil en el fondo?"
│  responder JSON"            │
└──────────┬──────────────────┘
           ▼
    decisión + telemetría al C2 + (si autorizado) terminal guidance
```

**Ventajas del pipeline:**
- ≥95 % de los frames terminan en Stage 1/2 (rápido, determinista).
- Solo el frame relevante invoca el VLM (caro).
- Stage 3 es **auditable**: cada inferencia se transmite con su pregunta y respuesta.

## Entrenamiento y dataset

### Fuentes de datos
- Imágenes de drones enemigos típicos (Shahed-136/131, Lancet, Orlan-10, Bayraktar TB2/TB3, FPV Mavic modificados, ZALA, etc.) — fuentes OSINT + datasets propios.
- Imágenes de drones aliados (Reaper, NH90, Scan Eagle, propios).
- Imágenes de civiles, vehículos, fauna (para minimizar falsos positivos).
- Síntesis con Unreal Engine 5 / NVIDIA Omniverse (digital twins de teatros operativos).
- Datasets públicos: VisDrone, DOTA, UAV123, Anti-UAV.

### Pipeline de entrenamiento
- Pre-entrenamiento del backbone con DINOv2 self-supervised.
- Fine-tuning supervisado con etiquetas: clase, IFF, contexto.
- Adversarial training contra camuflaje y oclusión.
- Cuantización post-training Q4_K_M / INT8 con calibración.
- Validación contra dataset de hold-out + simulación AirSim.

### Actualización OTA
- Nuevos drones enemigos detectados en el teatro → reentrenamiento incremental.
- LoRA adapters de 5–30 MB transmitidos por enlace seguro.
- **Validación obligatoria en banco** antes de despliegue OTA en flota activa.

## Razonamiento autónomo en degradación

Si el enlace con el C2 cae **después** de la autorización de engagement:
- El dron mantiene el track sobre el objetivo asignado (visual + IMU).
- Re-verifica con VLM cada N frames: amigo/civil/objetivo.
- Si el VLM detecta civil o amigo en línea de fuego → **aborta** y entra en loiter.
- Si pasan T_max segundos sin re-confirmar enlace → RTH (return to home).

**Esto NO es autonomía letal sin humano.** Es **continuación de una orden ya
autorizada por un humano** con salvaguardas adicionales del VLM. Equivalente
doctrinal a un misil "fire-and-forget" tipo IRIS-T, AIM-9X, etc.

## Carga útil del interceptor

Múltiples opciones, no excluyentes:

1. **Kinetic kill (ramming)** — impacto directo, sin explosivo. Más barato,
   menor colateral, requiere mayor precisión terminal.
2. **Red de captura** — pliegue lanzado, captura UAV de ala rotatoria.
3. **Carga fragmentaria pequeña (50–200 g)** — espoleta de proximidad, para
   UAS ala fija rápidos tipo Shahed.
4. **Net-gun + paracaídas** — recuperación del objetivo intacto (valor inteligencia).
5. **Dispositivo de jamming dirigido** — modo no-cinético.

La carga se selecciona por misión y por clasificación del objetivo.
