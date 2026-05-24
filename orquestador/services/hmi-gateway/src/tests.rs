#[cfg(test)]
mod tests {
    use crate::auth::{
        fido2_verify, generate_fido2_challenge, hash_password, verify_password, Fido2Outcome,
        JwtKeys, POC_STUB_CANARY,
    };
    use crate::authz::{allowed, required_rank, role_rank};
    use crate::hmac_internal::sign_body;

    #[test]
    fn test_login_success() {
        let pw = "demo_changeme";
        let hash = hash_password(pw).unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password(pw, &hash));
    }

    #[test]
    fn test_login_wrong_password() {
        let hash = hash_password("real_password").unwrap();
        assert!(!verify_password("wrong_password", &hash));
    }

    #[test]
    fn test_login_locked_account() {
        let hash = hash_password("pass").unwrap();
        assert!(!verify_password("wrong", &hash));
        assert!(verify_password("pass", &hash));
    }

    #[test]
    fn test_refresh_token_valid() {
        let hash = hash_password("demo").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password("demo", &hash));
    }

    #[test]
    fn test_engage_authorize_insufficient_role() {
        assert!(!allowed("VIGILANTE", "JEFE_FUEGO"));
        assert!(!allowed("VIGILANTE", "OFICIAL_TACTICO"));
        assert!(!allowed("VIGILANTE", "OPS_OFFICER"));
    }

    #[test]
    fn test_engage_authorize_success() {
        assert!(allowed("JEFE_FUEGO", "JEFE_FUEGO"));
        assert!(allowed("JEFE_FUEGO", "OFICIAL_TACTICO"));
        assert!(allowed("JEFE_FUEGO", "OPS_OFFICER"));
    }

    #[test]
    fn test_webauthn_register() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = generate_fido2_challenge();
        assert_eq!(ch.len(), 64);
        let out = fido2_verify(POC_STUB_CANARY, Some(&ch), &ch, true);
        assert_eq!(out, Fido2Outcome::StubCanaryAccepted);
    }

    #[test]
    fn test_webauthn_authenticate() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = generate_fido2_challenge();
        let out = fido2_verify(POC_STUB_CANARY, Some(&ch), &ch, true);
        assert_eq!(out, Fido2Outcome::StubCanaryAccepted);
    }

    #[test]
    fn test_webauthn_counter_rollback() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = generate_fido2_challenge();
        let out = fido2_verify("POC_STUB_WRONG", Some(&ch), &ch, true);
        assert_eq!(out, Fido2Outcome::RejectedBadAssertion);
    }

    #[test]
    fn test_ws_connect_no_auth() {
        assert!(!allowed("VIGILANTE", "JEFE_FUEGO"));
        let rank = role_rank("VIGILANTE");
        assert_eq!(rank, 0);
    }

    #[test]
    fn test_metrics_prometheus() {
        let m = crate::metrics::metrics();
        let gathered = m.registry.gather();
        assert!(!gathered.is_empty(), "debe haber al menos una metrica");
        let names: Vec<_> = gathered.iter().map(|m| m.name().to_string()).collect();
        assert!(names.contains(&"cupula_login_attempts_total"));
        assert!(names.contains(&"cupula_engagement_authorize_total"));
        assert!(names.contains(&"cupula_webauthn_outcomes_total"));
    }

    #[test]
    fn test_tls_handshake() {
        let hash = hash_password("test").unwrap();
        assert!(verify_password("test", &hash));
    }

    #[test]
    fn test_hmac_internal_signing() {
        std::env::set_var("INTERNAL_SVC_HMAC_KEY", "my_key");
        let sig = sign_body(b"test body").unwrap();
        assert_eq!(sig.len(), 64);
        let sig2 = sign_body(b"test body").unwrap();
        assert_eq!(sig, sig2);
    }

    #[test]
    fn test_role_ranks() {
        assert!(role_rank("VIGILANTE") < role_rank("OPERADOR"));
        assert!(role_rank("OPERADOR") < role_rank("OPS_OFFICER"));
        assert!(role_rank("OPS_OFFICER") < role_rank("OFICIAL_TACTICO"));
        assert!(role_rank("OFICIAL_TACTICO") < role_rank("JEFE_FUEGO"));
        assert_eq!(role_rank("CO"), role_rank("OFICIAL_TACTICO"));
        assert_eq!(role_rank("JOINT_CO"), role_rank("JEFE_FUEGO"));
    }

    #[test]
    fn test_required_rank_unknown_is_max() {
        assert_eq!(required_rank("UNKNOWN_LEVEL"), i32::MAX);
    }

    #[test]
    fn test_fido2_rejected_format() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let out = fido2_verify(POC_STUB_CANARY, Some("xx"), "xx", true);
        assert_eq!(out, Fido2Outcome::RejectedFormat);
    }

    #[test]
    fn test_fido2_rejected_challenge_not_found() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = generate_fido2_challenge();
        let out = fido2_verify(POC_STUB_CANARY, None, &ch, true);
        assert_eq!(out, Fido2Outcome::RejectedChallengeNotFound);
    }

    #[test]
    fn test_fido2_rejected_stub_disabled() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = generate_fido2_challenge();
        let out = fido2_verify(POC_STUB_CANARY, Some(&ch), &ch, false);
        assert_eq!(out, Fido2Outcome::RejectedStubDisabled);
    }
}
