//! Tipos compartidos entre módulos de fusion/tracker.

use chrono::{DateTime, Utc};
use nalgebra::{SMatrix, SVector};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Estado físico 9D: [px, py, pz, vx, vy, vz, ax, ay, az].
pub type StateVec = SVector<f64, 9>;
pub type StateCov = SMatrix<f64, 9, 9>;

/// Medida 3D (posición ENU local).
pub type Measurement = SVector<f64, 3>;
pub type MeasCov = SMatrix<f64, 3, 3>;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ImmMode {
    /// Constant velocity
    Cv,
    /// Constant acceleration
    Ca,
    /// Coordinated turn
    Ct,
}

impl ImmMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ImmMode::Cv => "CV",
            ImmMode::Ca => "CA",
            ImmMode::Ct => "CT",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorObservation {
    pub sensor_id: String,
    pub sensor_type: String,
    pub timestamp: DateTime<Utc>,
    /// Posición ENU local en metros (origen = primer sensor o referencia configurada).
    pub enu_xyz_m: [f64; 3],
    /// Posición geodésica para output.
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_msl_m: f64,
    pub altitude_agl_m: f64,
    pub snr_db: f64,
    pub quality: f64,
    pub doppler_mps: f64,
    pub rcs_dbsm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackStatus {
    pub track_id: String,
    pub confirmed: bool,
    pub hits: u32,
    pub misses: u32,
    pub track_quality: f64,
    pub imm_mode: String,
    pub px_m: f64,
    pub py_m: f64,
    pub pz_m: f64,
    pub vx_mps: f64,
    pub vy_mps: f64,
    pub vz_mps: f64,
    pub speed_mps: f64,
    pub timestamp: DateTime<Utc>,
    pub sensors_contributing: Vec<String>,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_msl_m: f64,
    pub altitude_agl_m: f64,
}

impl TrackStatus {
    pub fn new_id() -> String {
        format!("T-{}", &Uuid::new_v4().simple().to_string()[..8])
    }
}
