# ROE-7 — Criterios de Engagement (versión PoC-v0.1)

## 1. Principio rector

Toda recomendación de **ENGAGE** del decision-engine debe estar gobernada por
los siguientes criterios, evaluados por el motor de políticas (OPA):

- IFF cooperativo amigo presente → **ENGAGE prohibido**, sin excepciones.
- Confianza de clasificación < 0.65 → no engagement letal.
- Civiles a <500 m → mínimo riesgo colateral **MEDIUM**, requiere autorización CO.
- Track dentro de geofence protegida (hospital, escuela, embajada, infra crítica) →
  requiere autorización **JOINT_CO**.

## 2. Niveles de autorización

| Nivel | Condiciones |
|------|-------------|
| OPS_OFFICER | Hostil confirmado, riesgo bajo, fuera de zonas protegidas |
| CO          | Civiles cercanos o amenaza probable (confianza < hostil) |
| JOINT_CO    | Dentro de zona protegida; cualquier escenario con riesgo MEDIUM+ |

## 3. Ventanas temporales

Toda recomendación ENGAGE incluye `engagement_window`. El operador dispone de
ese intervalo para autorizar. Vencida la ventana, el sistema vuelve a evaluar.
