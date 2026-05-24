# 11 — Roadmap y fases del programa

## Fases macro

```
M0      M3       M6       M9      M12     M15     M18     M21     M24
│       │        │        │       │       │       │       │       │
├───────┤        │        │       │       │       │       │       │
│ FASE 0│        │        │       │       │       │       │       │
│ Diseño│        │        │       │       │       │       │       │
│       │        │        │       │       │       │       │       │
│       ├────────┴────────┤       │       │       │       │       │
│       │     FASE 1      │       │       │       │       │       │
│       │  PoC simulador  │       │       │       │       │       │
│       │  + orquestador  │       │       │       │       │       │
│       │                 │       │       │       │       │       │
│       │                 ├───────┴───────┤       │       │       │
│       │                 │   FASE 2      │       │       │       │
│       │                 │ Edge AI dron  │       │       │       │
│       │                 │ + integración │       │       │       │
│       │                 │                       │       │       │
│       │                 │                       ├───────┤       │
│       │                 │                       │FASE 3 │       │
│       │                 │                       │Pruebas│       │
│       │                 │                       │vivo   │       │
│       │                 │                       │       ├───────┤
│       │                 │                       │       │FASE 4 │
│       │                 │                       │       │Cert + │
│       │                 │                       │       │prod 1ª│
└───────┴─────────────────┴───────────────────────┴───────┴───────┘
```

## FASE 0 (M0–M3) — Diseño y validación conceptual

**Objetivos:**
- Documento de Requisitos Operativos (DRO) firmado por EMACON.
- Análisis funcional + arquitectura técnica detallada.
- Plan de validación y aceptación (PVA).
- Modelo de amenazas formal (CCN-STIC + STRIDE).
- Comité ético constituido.
- Article 36 review inicial.

**Entregables:**
- Doc arquitectónico (este repo, ampliado).
- Modelo formal de amenaza.
- Plan de pruebas.

## FASE 1 (M3–M9) — PoC orquestador + simulador

**Objetivos:**
- Servicios core (sensor-ingest, track-fusion, threat-class, decision-engine) en
  cluster k3s de laboratorio.
- HMI operador con vista 3D y panel de recomendación.
- Simulador digital twin (Gazebo + AirSim) con 100 pistas concurrentes.
- LLM táctico entrenado y validado sobre dataset doctrinal.
- Validación contra dataset histórico de incidentes reales OSINT.

**Hitos:**
- PR-1.1: ingesta multisensor + fusión IMM con error < 10 m a 3 km.
- PR-1.2: clasificación amigo/enemigo en simulación con F1 > 0,92.
- PR-1.3: HMI demuestra ciclo completo con autorización de doble factor.
- PR-1.4: simulación de saturación con 64 pistas y 32 efectores virtuales.

## FASE 2 (M9–M15) — Edge AI en dron + integración

**Objetivos:**
- Pipeline YOLO + clasificador + VLM funcionando en Jetson Orin Nano.
- Latencia E2E (frame → decisión) < 100 ms.
- Dataset propio de drones objetivo (≥50.000 imágenes etiquetadas).
- Integración con dron físico AVISPA-K prototipo.
- Enlace MANET cifrado funcional entre 4 drones + C2.

**Hitos:**
- PR-2.1: VLM en banco con Pd ≥ 0,95 y FAR ≤ 1 % en dataset hold-out.
- PR-2.2: Vuelo cautivo (cable) con clasificación en tiempo real.
- PR-2.3: Vuelo libre con waypoints comandados, telemetría y vídeo H.265 al C2.
- PR-2.4: Ejercicio "blue vs red" con 4 amigos + 4 enemigos simulados.

## FASE 3 (M15–M21) — Pruebas en vivo

**Objetivos:**
- Pruebas en INTA-CEDEA El Arenosillo (Huelva) y Polígono de Tiro de Bárdenas.
- Engagements reales contra drones objetivo (sin tripular ambos lados).
- Pruebas EW: jamming GPS, jamming enlace, spoofing.
- Pruebas de seguridad: pentesting y red team CCN-CERT.

**Hitos:**
- PR-3.1: interceptación cinética exitosa de dron tipo Shahed-replica.
- PR-3.2: 12 engagements consecutivos con Pk acumulada ≥ 0,8.
- PR-3.3: resistencia EW: sistema sigue operativo bajo jamming GPS de 30 dB.
- PR-3.4: red team falla en comprometer un nodo crítico en 5 días.

## FASE 4 (M21–M24) — Certificación + producción inicial

**Objetivos:**
- Certificación CC EAL4+ del subsistema cripto.
- ENS categoría ALTA aprobado.
- Aprobación DGAM + Estado Mayor.
- Article 36 final.
- Producción y entrega de primer lote operativo (1 sistema completo +
  200 interceptores).
- Formación de operadores en MAESTRANZA.

**Hitos:**
- PR-4.1: certificados emitidos.
- PR-4.2: primer sistema entregado y aceptado por Ejército del Aire.
- PR-4.3: doctrina operativa y manuales publicados.
- PR-4.4: 20 operadores certificados.

## Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Cuello de botella en Jetson (geopolítico USA) | M | A | Plan B con Hailo, plan C con chip europeo PERTE |
| Sobre-coste por sensores radar | A | M | Asociación temprana con Indra; programa europeo (ESSI) |
| Fallo certificación CC | M | A | Trabajar con CCN desde M0, no al final |
| Oposición sociopolítica a LAWS | A | A | Comunicación, transparencia, comité ético público |
| Falsos positivos en pruebas | A | M | Datasets enriquecidos, ensemble, MHC siempre activo |
| Retrasos en pruebas (meteo, autorizaciones) | A | M | Buffer 20 % en planning, simulación intensiva paralela |
| Fuga de personal clave a privado | M | A | Pluses de retención, contratos blindados |

## Equipo recomendado

- **PM (Program Manager)** — perfil dual militar/civil.
- **Arquitecto jefe** — sistemas distribuidos.
- **Líder C2** + 8 ingenieros (Rust/Python).
- **Líder ML/VLM** + 6 ingenieros (visión por computador, NLP).
- **Líder embarcado** + 6 ingenieros (firmware, ROS, PX4).
- **Líder hardware** + 4 ingenieros (electrónica, mecánica).
- **Líder ciberseguridad** + 4 expertos (cripto, red team, CC).
- **Líder simulación** + 3 ingenieros (Gazebo, Unreal).
- **Líder UX** + 2 diseñadores HMI táctico.
- **DevSecOps** + 2 expertos.
- **Equipo legal/ético**: 2 abogados militares + 1 ético externo.
- **Liaisons**: Ejército del Aire, Armada, CCN, INTA, OTAN.

**Total ~45 FTEs**, escalable a 70 FTE en fase 3.
