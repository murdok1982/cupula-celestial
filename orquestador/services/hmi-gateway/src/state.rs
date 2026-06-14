use std::sync::Arc;

use sqlx::PgPool;

use crate::auth::{webauthn as wa, JwtKeys};

#[derive(Clone)]
pub struct AppState {
    pub jwt: Arc<JwtKeys>,
    pub producer: Option<Arc<rdkafka::producer::FutureProducer>>,
    pub db: Option<PgPool>,
    pub redis: Option<Arc<redis::Client>>,
    pub audit_log_url: String,
    pub poc_banner_active: bool,
    pub webauthn: Option<Arc<wa::WebauthnService>>,
}
