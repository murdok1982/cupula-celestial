package cupula.roe_test

# ===========================================================================
# Tests OPA — refuerzos ROE refactor (H-CRIT-003).
# Correr con: opa test policies tests
# ===========================================================================

import data.cupula.roe

# ---------- HOSTILE_CONFIRMED ----------

test_allow_hostile_high_confidence_clean if {
    roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-1",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.95,
                "altitude_agl_m": 300,
                "speed_mps": 60,
                "position": {"lat": 0.0, "lon": 0.0},
                "tti_seconds": 20,
                "independent_sensor_sources": 1
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": false,
                "in_military_zone": false
            }
        }
}

test_deny_hostile_confidence_below_new_threshold if {
    not roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-2",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.80,        # bajo 0.90 default
                "altitude_agl_m": 300,
                "tti_seconds": 20,
                "speed_mps": 60,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 1
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": false,
                "in_military_zone": false
            }
        }
}

test_allow_hostile_075_when_two_sensors_and_military_zone if {
    roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-3",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.76,
                "altitude_agl_m": 400,
                "tti_seconds": 18,
                "speed_mps": 80,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 2
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": false,
                "in_military_zone": true
            }
        }
}

test_deny_hostile_friend_iff if {
    not roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-4",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.99,
                "altitude_agl_m": 300,
                "tti_seconds": 10,
                "speed_mps": 60,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 3
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "iff_status": "FRIEND",
                "lethal_payload": false,
                "in_military_zone": true
            }
        }
}

# ---------- THREAT_PROBABLE ----------

test_allow_threat_probable_short_tti_clear if {
    roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-5",
                "classification": "THREAT_PROBABLE",
                "confidence": 0.82,
                "altitude_agl_m": 250,
                "tti_seconds": 12,
                "speed_mps": 70,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 1
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": false,
                "in_military_zone": false
            }
        }
}

test_deny_threat_probable_in_protected_zone if {
    not roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-6",
                "classification": "THREAT_PROBABLE",
                "confidence": 0.95,
                "altitude_agl_m": 250,
                "tti_seconds": 10,
                "speed_mps": 70,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 2
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": true,    # geofence → bloquea
                "civilians_within_500m": false,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": false,
                "in_military_zone": false
            }
        }
}

# ---------- authorization_level ----------

test_level_ops_officer_for_clean_engagement if {
    "OPS_OFFICER" == roe.authorization_level
        with input as {
            "track": {
                "track_id": "T-A",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.95,
                "altitude_agl_m": 500,
                "tti_seconds": 20,
                "speed_mps": 80,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 1
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": false,
                "in_military_zone": false
            }
        }
}

test_level_oficial_tactico_with_lethal_payload if {
    "OFICIAL_TACTICO" == roe.authorization_level
        with input as {
            "track": {
                "track_id": "T-B",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.95,
                "altitude_agl_m": 200,
                "tti_seconds": 18,
                "speed_mps": 60,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 1
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": true,
                "in_military_zone": true
            }
        }
}

test_level_jefe_fuego_in_protected_zone if {
    "JEFE_FUEGO" == roe.authorization_level
        with input as {
            "track": {
                "track_id": "T-C",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.95,
                "altitude_agl_m": 150,
                "tti_seconds": 10,
                "speed_mps": 60,
                "position": {"lat":0.0,"lon":0.0},
                "independent_sensor_sources": 2
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": true,
                "civilians_within_500m": true,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": true,
                "in_military_zone": false
            }
        }
}

# ---------- COLLATERAL DAMAGE THRESHOLD ----------

test_deny_engagement_if_collateral_exceeds_threshold if {
    not roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-D",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.95,
                "altitude_agl_m": 100,
                "tti_seconds": 15,
                "speed_mps": 60,
                "position": {"lat": 40.416, "lon": -3.704},
                "independent_sensor_sources": 2
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": true,
                "estimated_collateral_damage": 0.85,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": true,
                "in_military_zone": false
            }
        }
}

test_deny_engagement_in_hospital_geofence if {
    not roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-E",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.95,
                "altitude_agl_m": 200,
                "tti_seconds": 10,
                "speed_mps": 60,
                "position": {"lat": 40.420, "lon": -3.710},
                "independent_sensor_sources": 2
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": true,
                "protected_zone_type": "HOSPITAL",
                "civilians_within_500m": true,
                "estimated_collateral_damage": 0.95,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": true,
                "in_military_zone": false
            }
        }
}

test_allow_engagement_low_collateral_in_military_zone if {
    roe.engagement_authorized
        with input as {
            "track": {
                "track_id": "T-F",
                "classification": "HOSTILE_CONFIRMED",
                "confidence": 0.95,
                "altitude_agl_m": 500,
                "tti_seconds": 5,
                "speed_mps": 60,
                "position": {"lat": 40.430, "lon": -3.720},
                "independent_sensor_sources": 2
            },
            "context": {
                "alert_level": "RED",
                "in_protected_zone": false,
                "civilians_within_500m": false,
                "estimated_collateral_damage": 0.05,
                "iff_status": "NO_RESPONSE",
                "lethal_payload": true,
                "in_military_zone": true
            }
        }
}
