package cupula.roe

# ===========================================================================
# Reglas de Enfrentamiento (ROE) — Cúpula Celestial (refactor H-CRIT-003)
# ===========================================================================
#
# Cambios respecto a la versión previa:
#  1. Regla ÚNICA `engagement_authorized`: composición jerárquica AND con `else := false`.
#     Sin asignaciones múltiples conflictivas.
#  2. Umbral por defecto HOSTILE_CONFIRMED elevado a 0.90.
#     Excepción 0.75 ↔ requiere dos sensores independientes Y zona militar.
#  3. `authorization_level` produce "OPS_OFFICER" | "OFICIAL_TACTICO" | "JEFE_FUEGO"
#     según contexto (carga letal, zona civil, alerta).
#
# Entrada esperada:
# {
#   "track": {
#       "track_id": "T-...",
#       "classification": "HOSTILE_CONFIRMED" | "THREAT_PROBABLE" | "SUSPICIOUS" | "UNKNOWN",
#       "confidence": 0.0-1.0,
#       "altitude_agl_m": float,
#       "speed_mps": float,
#       "position": {"lat": ..., "lon": ...},
#       "vector_to_asset_deg": float,
#       "tti_seconds": float,
#       "independent_sensor_sources": int     # nuevo
#   },
#   "context": {
#       "alert_level": "GREEN"|"AMBER"|"RED"|"BLACK",
#       "in_protected_zone": bool,
#       "in_military_zone":  bool,           # nuevo
#       "civilians_within_500m": bool,
#       "iff_status": "FRIEND"|"NO_RESPONSE"|"UNKNOWN"|"NEUTRAL",
#       "lethal_payload": bool               # nuevo: ¿interceptor lleva carga letal?
#   },
#   "operator": {
#       "role": "OPS_OFFICER"|"OFICIAL_TACTICO"|"JEFE_FUEGO"|"CO"|"JOINT_CO"
#   }
# }
#
# Umbrales configurables vía data.roe_thresholds (default abajo).

import future.keywords.in
import future.keywords.if

# ---------------------------------------------------------------------------
# Umbrales (data-driven; defaults aquí)
# ---------------------------------------------------------------------------

threshold_hostile_default := 0.90
threshold_hostile_two_sensors_military := 0.75
threshold_threat_probable := 0.80

# ---------------------------------------------------------------------------
# Denegaciones explícitas (cortocircuitos absolutos)
# ---------------------------------------------------------------------------

deny[msg] if {
    input.context.iff_status == "FRIEND"
    msg := "IFF=FRIEND: engagement bloqueado"
}

deny[msg] if {
    not classification_is_hostile_or_probable
    msg := "clasificación insuficiente"
}

deny[msg] if {
    input.track.confidence < 0.65
    msg := sprintf("confidence=%.2f < umbral mínimo 0.65", [input.track.confidence])
}

deny[msg] if {
    not valid_alert_level
    msg := sprintf("alert_level=%s no autoriza engagement", [input.context.alert_level])
}

classification_is_hostile_or_probable if {
    input.track.classification == "HOSTILE_CONFIRMED"
}
classification_is_hostile_or_probable if {
    input.track.classification == "THREAT_PROBABLE"
}

valid_alert_level if {
    input.context.alert_level == "RED"
}
valid_alert_level if {
    input.context.alert_level == "BLACK"
}
valid_alert_level if {
    input.context.alert_level == "AMBER"
    input.track.classification == "HOSTILE_CONFIRMED"
}

# ---------------------------------------------------------------------------
# Autorización principal — regla única con composición AND
# ---------------------------------------------------------------------------

default engagement_authorized := false

engagement_authorized if {
    count(deny) == 0
    classification_clears_threshold
    not iff_blocks
} else := false

iff_blocks if {
    input.context.iff_status == "FRIEND"
}

classification_clears_threshold if {
    input.track.classification == "HOSTILE_CONFIRMED"
    input.track.confidence >= threshold_hostile_default
}
classification_clears_threshold if {
    input.track.classification == "HOSTILE_CONFIRMED"
    input.track.confidence >= threshold_hostile_two_sensors_military
    object.get(input.track, "independent_sensor_sources", 0) >= 2
    object.get(input.context, "in_military_zone", false) == true
}
classification_clears_threshold if {
    input.track.classification == "THREAT_PROBABLE"
    input.track.confidence >= threshold_threat_probable
    input.track.tti_seconds <= 15
    not input.context.in_protected_zone
    not input.context.civilians_within_500m
}

# ---------------------------------------------------------------------------
# authorization_level — qué rango operativo se requiere
# ---------------------------------------------------------------------------
#
# Orden de evaluación (priorizamos el caso más restrictivo):
#  1. JEFE_FUEGO  si zona protegida, civiles cerca, o carga letal en zona civil.
#  2. OFICIAL_TACTICO  si carga letal o civiles cerca.
#  3. OPS_OFFICER  resto (default cuando engagement_authorized).
#  Si no autorizado → "NONE".

default authorization_level := "NONE"

authorization_level := "JEFE_FUEGO" if {
    engagement_authorized
    requires_jefe_fuego
}

authorization_level := "OFICIAL_TACTICO" if {
    engagement_authorized
    not requires_jefe_fuego
    requires_oficial_tactico
}

authorization_level := "OPS_OFFICER" if {
    engagement_authorized
    not requires_jefe_fuego
    not requires_oficial_tactico
}

requires_jefe_fuego if {
    input.context.in_protected_zone
}
requires_jefe_fuego if {
    input.context.civilians_within_500m
    object.get(input.context, "lethal_payload", false) == true
}
requires_jefe_fuego if {
    input.track.classification == "THREAT_PROBABLE"
    input.context.civilians_within_500m
}

requires_oficial_tactico if {
    object.get(input.context, "lethal_payload", false) == true
}
requires_oficial_tactico if {
    input.context.civilians_within_500m
}
requires_oficial_tactico if {
    input.track.classification == "THREAT_PROBABLE"
}

# ---------------------------------------------------------------------------
# collateral_risk (sin cambios funcionales relevantes)
# ---------------------------------------------------------------------------

default collateral_risk := "HIGH"

collateral_risk := "NEGLIGIBLE" if {
    not input.context.in_protected_zone
    not input.context.civilians_within_500m
    input.track.altitude_agl_m > 200
}

collateral_risk := "LOW" if {
    not input.context.in_protected_zone
    not input.context.civilians_within_500m
    input.track.altitude_agl_m <= 200
    input.track.altitude_agl_m > 100
}

collateral_risk := "MEDIUM" if {
    input.context.civilians_within_500m
    not input.context.in_protected_zone
}

collateral_risk := "HIGH" if {
    input.context.in_protected_zone
}

# ---------------------------------------------------------------------------
# reasons (explicabilidad)
# ---------------------------------------------------------------------------

reasons := r if {
    r := array.concat(deny_list, accept_list)
}

deny_list := [m | some m in deny]

accept_list := arr if {
    engagement_authorized
    arr := [
        sprintf("confidence=%.2f >= threshold", [input.track.confidence]),
        sprintf("alert_level=%s", [input.context.alert_level]),
        sprintf("authorization_level=%s", [authorization_level]),
    ]
}
accept_list := [] if {
    not engagement_authorized
}
