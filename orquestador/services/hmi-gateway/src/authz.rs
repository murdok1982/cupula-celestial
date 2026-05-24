//! Mapping rol-jerarquía y verificación de rango operativo (H-CRIT-003).
//!
//! Usado por el endpoint `/engagement/authorize` para asegurar que el rol
//! del JWT del operador es >= al exigido por OPA en `authorization_level`.

pub fn role_rank(role: &str) -> i32 {
    match role {
        "VIGILANTE" | "ANALYST" | "AUDIT" | "ROE_OFFICER" => 0,
        "OPERADOR" => 1,
        "OPS_OFFICER" => 2,
        "OFICIAL_TACTICO" | "CO" => 3,
        "JEFE_FUEGO" | "JOINT_CO" | "SYSTEM" => 4,
        _ => -1,
    }
}

pub fn required_rank(level: &str) -> i32 {
    match level {
        "VIGILANTE" => 0,
        "OPERADOR" => 1,
        "OPS_OFFICER" => 2,
        "OFICIAL_TACTICO" | "CO" => 3,
        "JEFE_FUEGO" | "JOINT_CO" => 4,
        _ => i32::MAX, // desconocido → bloqueamos
    }
}

pub fn allowed(role: &str, required_level: &str) -> bool {
    role_rank(role) >= required_rank(required_level)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operador_cannot_authorize_oficial_tactico() {
        assert!(!allowed("OPERADOR", "OFICIAL_TACTICO"));
        assert!(!allowed("OPERADOR", "JEFE_FUEGO"));
    }

    #[test]
    fn ops_officer_can_authorize_ops_officer() {
        assert!(allowed("OPS_OFFICER", "OPS_OFFICER"));
        assert!(!allowed("OPS_OFFICER", "OFICIAL_TACTICO"));
    }

    #[test]
    fn oficial_tactico_can_authorize_ops_and_oficial() {
        assert!(allowed("OFICIAL_TACTICO", "OPS_OFFICER"));
        assert!(allowed("OFICIAL_TACTICO", "OFICIAL_TACTICO"));
        assert!(!allowed("OFICIAL_TACTICO", "JEFE_FUEGO"));
    }

    #[test]
    fn jefe_fuego_can_authorize_anything() {
        assert!(allowed("JEFE_FUEGO", "OPS_OFFICER"));
        assert!(allowed("JEFE_FUEGO", "OFICIAL_TACTICO"));
        assert!(allowed("JEFE_FUEGO", "JEFE_FUEGO"));
    }

    #[test]
    fn vigilante_rejected_for_all_engagements() {
        assert!(!allowed("VIGILANTE", "OPS_OFFICER"));
        assert!(!allowed("VIGILANTE", "OFICIAL_TACTICO"));
        assert!(!allowed("VIGILANTE", "JEFE_FUEGO"));
    }

    #[test]
    fn unknown_role_rejected() {
        assert!(!allowed("HACKER", "OPS_OFFICER"));
    }

    #[test]
    fn unknown_level_rejected_even_for_jefe_fuego() {
        assert!(!allowed("JEFE_FUEGO", "WHATEVER_LVL"));
    }

    #[test]
    fn legacy_co_maps_to_oficial_tactico() {
        assert_eq!(role_rank("CO"), role_rank("OFICIAL_TACTICO"));
        assert_eq!(required_rank("CO"), required_rank("OFICIAL_TACTICO"));
    }
}
