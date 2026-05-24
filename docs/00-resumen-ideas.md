# 00 — Resumen de las mejores ideas

Versión condensada de los 11 documentos. Pensada para Director General o
Secretario de Estado.

## 1. La idea matriz

**Invertir la curva de coste de la defensa antiaérea de proximidad** mediante
una IA orquestadora soberana que coordina un enjambre interceptor con visión
embarcada, bajo control humano significativo (MHC).

## 2. Las 10 ideas técnicas más fuertes

### Idea 1 — Pipeline en cascada en el dron (no LLM puro)
No se sube un LLM monolítico al dron. Se compone una cascada:
**YOLOv9-tiny → CNN clasificador propio → VLM (Moondream2)**. El 95 % de los
frames se resuelven antes de invocar al VLM. Latencia E2E < 100 ms en Jetson
Orin Nano 8 GB. Coste de cómputo ~500 € por dron.

### Idea 2 — Orquestador híbrido determinista + LLM
Las funciones críticas (fusión sensores, asignación arma-objetivo) son
**algoritmos determinísticos auditables** (JPDAF, Hungarian). El LLM táctico
(Llama 3.1 8B o Qwen 14B local) **solo recomienda**, nunca decide. Su salida
está forzada a JSON Schema validado por código determinista.

### Idea 3 — ROE como código (Policy-as-Code)
Las Reglas de Enfrentamiento se escriben en **Rego/OPA** o DSL propio.
Versionables, firmables, simulables. Los juristas militares pueden leerlas y
los ingenieros las ejecutan literalmente. Cierra la brecha doctrina-software.

### Idea 4 — Geo/time/munition-fences en hardware
Las salvaguardas (no atacar embajadas, escuelas, etc.) no viven solo en
software: están **firmadas en el HSM** del dron. Cambiarlas requiere dos firmas
+ acto físico. Imposible de saltarse por bug o ataque.

### Idea 5 — Resiliencia EW por diseño
GPS jamming es un hecho. Solución: **CRPA + GALILEO PRS + VIO + TRN** en cada
dron. Enlace: **frequency-hopping LPI/LPD + fallback SATCOM banda L**.
Modo degradado autónomo con ROE pre-cargada si el enlace cae.

### Idea 6 — Coste-efecto invertido
Objetivo industrial: **<8.000 € por interceptor**. Comparado con misiles
estándar 500k–2M€. Carga modular (kinetic / red / frag / jammer) por misión.
Producción nacional con Indra + PYMEs + INTA. **Sostenibilidad logística** ante
ataques de saturación tipo Shahed.

### Idea 7 — Trazabilidad criptográfica completa
Cada decisión (sensor, clasificación, recomendación LLM, autorización
operador, comando al dron, vídeo de impacto) se firma y se enlaza en
**cadena Merkle** apppend-only. Replicada a nodo testigo aislado. Forense
admisible en juicio militar y revisión internacional.

### Idea 8 — VLM actualizable OTA con validación
El modelo del dron es **firmado y actualizable** vía LoRA adapters (5–30 MB).
Permite reaccionar en horas a nuevos modelos de drones enemigos detectados
en el teatro. Toda actualización requiere validación en banco antes de
desplegarse a la flota.

### Idea 9 — Soberanía sin depender de EEUU
Hardware Jetson hoy (USA) → plan B con Hailo (Israel/EU) → plan C con SoC
neural español/europeo (PERTE Chip, ESCAPE-2 del INTA). Software stack
100 % open source o español. Cripto post-cuántica con Kyber/Dilithium
desde el día uno.

### Idea 10 — Simulador como first-class citizen
**Gazebo + AirSim + Unreal Engine 5 + NVIDIA Isaac Sim** desde día 0. Cada
algoritmo se prueba en simulación con 100 pistas concurrentes antes de
banco. El entrenamiento del VLM usa síntesis para casos raros. CI/CD
incluye regresión en simulación.

## 3. Cómo defenderse políticamente (no es FOMO de IA letal)

- **MHC garantizado**: humano autoriza cada engagement letal. La opción
  L4 (autonomía letal) no existe en el firmware.
- **Comité ético público** con miembro designado por Congreso.
- **Article 36 review** obligatorio y documentado.
- **Auditoría externa anual** (CCN, Tribunal de Cuentas, parlamentaria).
- **Cumplimiento DIH** verificable en cada engagement por audit log.

## 4. Encaje estratégico

- Capa interior (0–8 km) de la defensa nacional, complemento a NASAMS/IRIS-T/Patriot.
- Encaje en **European Sky Shield Initiative (ESSI)** como contribución española.
- Producto exportable a aliados europeos OTAN tras certificación.
- Industria nacional reforzada, PERTE de Defensa coherente.

## 5. Próximos pasos sugeridos

1. **Validación política** (CESID/CNI + DIGENECO + EMACON): ¿pasa el filtro estratégico?
2. **Acuerdo con Indra/GMV/INTA** para arquitectura industrial.
3. **Lanzamiento FASE 0**: 3 meses, equipo reducido (12 personas), doc DRO.
4. **Article 36 inicial**.
5. **Constitución del Comité Ético** y notificación a Congreso (Comisión Defensa).
6. **Solicitud presupuestaria** PGE / fondos PERTE / EDF (European Defence Fund).
