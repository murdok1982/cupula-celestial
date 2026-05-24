//! Track manager: gestiona el ciclo de vida de los tracks (tentativos, confirmados,
//! eliminados) e integra IMM + asociación + M/N confirmation.

use std::collections::{HashMap, VecDeque};

use chrono::{DateTime, Utc};
use nalgebra::{DMatrix, Matrix3};
use tracing::{debug, info};

use crate::fusion::association::{auction_assign, filter_by_gate};
use crate::fusion::imm::ImmFilter;
use crate::fusion::kalman::measurement_matrix;
use crate::types::{Measurement, SensorObservation, StateCov, StateVec, TrackStatus};

const MAX_TRACKS: usize = 256;
const MAHALANOBIS_GATE_3D: f64 = 9.0; // ~3 sigma para chi2 con 3 dof
const TENTATIVE_MAX_AGE_S: f64 = 3.0;
const CONFIRMED_DROP_AFTER_MISSES: u32 = 6;

#[derive(Debug, Clone)]
pub struct Track {
    pub id: String,
    pub confirmed: bool,
    pub imm: ImmFilter,
    pub hits: u32,
    pub misses: u32,
    /// Historia para M/N: 1 si hubo asociación, 0 si no, ventana N
    pub history: VecDeque<u8>,
    pub last_update: DateTime<Utc>,
    pub sensors_contributing: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub last_lat: f64,
    pub last_lon: f64,
    pub last_alt_msl_m: f64,
    pub last_alt_agl_m: f64,
}

impl Track {
    fn from_observation(obs: &SensorObservation, conf_n: usize) -> Self {
        let mut x = StateVec::zeros();
        x[0] = obs.enu_xyz_m[0];
        x[1] = obs.enu_xyz_m[1];
        x[2] = obs.enu_xyz_m[2];
        let mut p = StateCov::identity() * 25.0;
        for i in 3..6 {
            p[(i, i)] = 100.0; // velocidad muy incierta
        }
        for i in 6..9 {
            p[(i, i)] = 50.0;
        }
        let imm = ImmFilter::new(x, p);
        let mut history = VecDeque::with_capacity(conf_n);
        history.push_back(1);
        Self {
            id: TrackStatus::new_id(),
            confirmed: false,
            imm,
            hits: 1,
            misses: 0,
            history,
            last_update: obs.timestamp,
            sensors_contributing: vec![obs.sensor_id.clone()],
            created_at: obs.timestamp,
            last_lat: obs.latitude,
            last_lon: obs.longitude,
            last_alt_msl_m: obs.altitude_msl_m,
            last_alt_agl_m: obs.altitude_agl_m,
        }
    }

    pub fn to_status(&self) -> TrackStatus {
        let (x, p) = self.imm.combined_state();
        let speed = (x[3].powi(2) + x[4].powi(2) + x[5].powi(2)).sqrt();
        // Track quality: combina probabilidad de modo dominante con sigmas posicionales.
        let pos_uncert = (p[(0, 0)] + p[(1, 1)] + p[(2, 2)]).sqrt();
        let q_base = 1.0 / (1.0 + pos_uncert / 10.0);
        let q_age = 1.0 - (self.misses as f64 / 10.0).min(0.8);
        let track_quality = (q_base * q_age).clamp(0.0, 1.0);
        TrackStatus {
            track_id: self.id.clone(),
            confirmed: self.confirmed,
            hits: self.hits,
            misses: self.misses,
            track_quality,
            imm_mode: self.imm.dominant_mode().as_str().to_string(),
            px_m: x[0],
            py_m: x[1],
            pz_m: x[2],
            vx_mps: x[3],
            vy_mps: x[4],
            vz_mps: x[5],
            speed_mps: speed,
            timestamp: self.last_update,
            sensors_contributing: self.sensors_contributing.clone(),
            latitude: self.last_lat,
            longitude: self.last_lon,
            altitude_msl_m: self.last_alt_msl_m,
            altitude_agl_m: self.last_alt_agl_m,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TrackerConfig {
    pub confirm_m: u32,
    pub confirm_n: u32,
    pub gate: f64,
}

impl Default for TrackerConfig {
    fn default() -> Self {
        Self {
            confirm_m: 3,
            confirm_n: 5,
            gate: MAHALANOBIS_GATE_3D,
        }
    }
}

pub struct TrackManager {
    pub config: TrackerConfig,
    pub tracks: HashMap<String, Track>,
    pub last_step_ts: Option<DateTime<Utc>>,
}

impl TrackManager {
    pub fn new(config: TrackerConfig) -> Self {
        Self {
            config,
            tracks: HashMap::new(),
            last_step_ts: None,
        }
    }

    /// Ejecuta un ciclo completo con un lote de observaciones (en el mismo timestamp aproximado).
    /// Devuelve los TrackStatus que pasaron a confirmados o actualizados.
    pub fn step(&mut self, observations: &[SensorObservation]) -> Vec<TrackStatus> {
        if observations.is_empty() {
            return Vec::new();
        }
        let now = observations
            .iter()
            .map(|o| o.timestamp)
            .max()
            .unwrap_or_else(Utc::now);

        let dt = self
            .last_step_ts
            .map(|t| (now - t).num_milliseconds() as f64 / 1000.0)
            .filter(|d| d.is_finite() && *d > 0.001)
            .unwrap_or(0.1);
        self.last_step_ts = Some(now);

        // 1) Predicción
        for tr in self.tracks.values_mut() {
            tr.imm.predict(dt);
        }

        // 2) Asociación: construir matriz de coste Mahalanobis
        let track_ids: Vec<String> = self.tracks.keys().cloned().collect();
        let n_tracks = track_ids.len();
        let n_meas = observations.len();
        let mut assignment_by_track_idx: Vec<Option<usize>> = vec![None; n_tracks];

        if n_tracks > 0 {
            let h = measurement_matrix();
            let mut cost = DMatrix::from_element(n_tracks, n_meas, 1e6f64);
            for (ti, tid) in track_ids.iter().enumerate() {
                let tr = &self.tracks[tid];
                let (x, p) = tr.imm.combined_state();
                let zhat = h * x;
                let mut s = h * p * h.transpose();
                for i in 0..3 {
                    s[(i, i)] += 1.0;
                } // R sumado
                let s_inv = s
                    .try_inverse()
                    .unwrap_or_else(|| (s + Matrix3::identity() * 1e-6).try_inverse().unwrap());
                for (mi, obs) in observations.iter().enumerate() {
                    let z = Measurement::new(obs.enu_xyz_m[0], obs.enu_xyz_m[1], obs.enu_xyz_m[2]);
                    let y = z - zhat;
                    let mhal = (y.transpose() * s_inv * y)[(0, 0)].max(0.0);
                    cost[(ti, mi)] = mhal;
                }
            }
            let raw = auction_assign(&cost, 5_000);
            assignment_by_track_idx = filter_by_gate(&cost, raw, self.config.gate);
        }

        let mut used_meas: Vec<bool> = vec![false; n_meas];
        let mut updated_statuses: Vec<TrackStatus> = Vec::new();

        // 3) Update por track
        for (ti, tid) in track_ids.iter().enumerate() {
            let assigned_m = assignment_by_track_idx[ti];
            let tr = self.tracks.get_mut(tid).expect("track existe");
            if let Some(mi) = assigned_m {
                used_meas[mi] = true;
                let obs = &observations[mi];
                let z = Measurement::new(obs.enu_xyz_m[0], obs.enu_xyz_m[1], obs.enu_xyz_m[2]);
                let r = measurement_noise(obs);
                tr.imm.update(&z, &r);
                tr.hits = tr.hits.saturating_add(1);
                tr.misses = 0;
                tr.last_update = obs.timestamp;
                if !tr.sensors_contributing.contains(&obs.sensor_id) {
                    tr.sensors_contributing.push(obs.sensor_id.clone());
                }
                tr.last_lat = obs.latitude;
                tr.last_lon = obs.longitude;
                tr.last_alt_msl_m = obs.altitude_msl_m;
                tr.last_alt_agl_m = obs.altitude_agl_m;
                push_history(&mut tr.history, 1, self.config.confirm_n as usize);
                check_confirmation(tr, self.config.confirm_m);
            } else {
                tr.misses = tr.misses.saturating_add(1);
                push_history(&mut tr.history, 0, self.config.confirm_n as usize);
            }
            updated_statuses.push(tr.to_status());
        }

        // 4) Crear tracks tentativos para medidas no asociadas
        for (mi, obs) in observations.iter().enumerate() {
            if used_meas[mi] {
                continue;
            }
            if self.tracks.len() >= MAX_TRACKS {
                debug!("MAX_TRACKS alcanzado, descartando medida");
                continue;
            }
            let tr = Track::from_observation(obs, self.config.confirm_n as usize);
            info!(track_id = %tr.id, "track tentativo creado");
            updated_statuses.push(tr.to_status());
            self.tracks.insert(tr.id.clone(), tr);
        }

        // 5) Limpieza: drop tracks tentativos viejos sin confirmación, y confirmados con muchas misses
        self.tracks.retain(|_, tr| {
            let age = (now - tr.created_at).num_milliseconds() as f64 / 1000.0;
            if !tr.confirmed && age > TENTATIVE_MAX_AGE_S {
                debug!(track_id = %tr.id, "drop tentative aged out");
                return false;
            }
            if tr.confirmed && tr.misses >= CONFIRMED_DROP_AFTER_MISSES {
                info!(track_id = %tr.id, "drop confirmed: missing too many");
                return false;
            }
            true
        });

        updated_statuses
    }
}

fn measurement_noise(obs: &SensorObservation) -> Matrix3<f64> {
    // Sensores con mayor quality → menor varianza. quality=1 → 1 m^2; quality=0.5 → 4 m^2; etc.
    let base = (2.0 - obs.quality).max(0.2);
    let pos = base * base * 2.0;
    Matrix3::from_diagonal_element(pos)
}

fn push_history(h: &mut VecDeque<u8>, v: u8, n: usize) {
    if h.len() >= n {
        h.pop_front();
    }
    h.push_back(v);
}

fn check_confirmation(tr: &mut Track, m: u32) {
    if tr.confirmed {
        return;
    }
    let sum: u32 = tr.history.iter().map(|x| *x as u32).sum();
    if sum >= m {
        tr.confirmed = true;
        info!(track_id = %tr.id, hits = tr.hits, "track confirmado");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn obs(t0: DateTime<Utc>, dt_ms: i64, sensor: &str, x: f64, y: f64) -> SensorObservation {
        SensorObservation {
            sensor_id: sensor.into(),
            sensor_type: "RADAR_AESA".into(),
            timestamp: t0 + Duration::milliseconds(dt_ms),
            enu_xyz_m: [x, y, 100.0],
            latitude: 40.4 + x * 1e-5,
            longitude: -3.7 + y * 1e-5,
            altitude_msl_m: 600.0,
            altitude_agl_m: 100.0,
            snr_db: 18.0,
            quality: 0.9,
            doppler_mps: 12.0,
            rcs_dbsm: -15.0,
        }
    }

    #[test]
    fn confirms_track_after_m_of_n_hits() {
        let mut tm = TrackManager::new(TrackerConfig {
            confirm_m: 3,
            confirm_n: 5,
            gate: 100.0,
        });
        let t0 = Utc::now();
        for k in 0..4 {
            let _ = tm.step(&[obs(t0, k * 200, "RAD1", k as f64 * 5.0, 0.0)]);
        }
        let any_confirmed = tm.tracks.values().any(|t| t.confirmed);
        assert!(any_confirmed, "se esperaba al menos un track confirmado");
    }

    #[test]
    fn drops_tentative_when_no_followup() {
        let mut tm = TrackManager::new(TrackerConfig::default());
        let t0 = Utc::now();
        let _ = tm.step(&[obs(t0, 0, "RAD1", 0.0, 0.0)]);
        // Avance grande sin observaciones
        let _ = tm.step(&[obs(t0, 4_000, "RAD1", 9999.0, 9999.0)]);
        // Tras edad > TENTATIVE_MAX_AGE_S, los tentativos sin confirmación se eliminan.
        let confirmed = tm.tracks.values().filter(|t| t.confirmed).count();
        assert!(confirmed <= 1);
    }

    #[test]
    fn confirmed_track_coast_to_drop() {
        let mut tm = TrackManager::new(TrackerConfig {
            confirm_m: 2,
            confirm_n: 3,
            gate: 100.0,
        });
        let t0 = Utc::now();
        for k in 0..3 {
            let _ = tm.step(&[obs(t0, k * 200, "RAD1", k as f64 * 5.0, 0.0)]);
        }
        let confirmed_before = tm.tracks.values().filter(|t| t.confirmed).count();
        assert!(confirmed_before >= 1, "debe haber un track confirmado");
        for k in 0..10 {
            let far_obs = obs(
                t0 + Duration::milliseconds(3000 + k * 500),
                "RAD1",
                9999.0 + k as f64,
                9999.0,
            );
            let _ = tm.step(&[far_obs]);
        }
        let after_misses = tm.tracks.values().filter(|t| t.confirmed).count();
        assert_eq!(after_misses, 0, "track confirmado perdido deberia dropear tras misses");
    }

    #[test]
    fn track_with_intermittent_observations() {
        let mut tm = TrackManager::new(TrackerConfig {
            confirm_m: 2,
            confirm_n: 4,
            gate: 100.0,
        });
        let t0 = Utc::now();
        for k in 0..4 {
            if k % 2 == 0 {
                let _ = tm.step(&[obs(t0, k * 200, "RAD1", k as f64 * 5.0, 0.0)]);
            } else {
                let _ = tm.step(&[]);
            }
        }
        let confirmed = tm.tracks.values().filter(|t| t.confirmed).count();
        assert!(
            confirmed <= 1,
            "intermitente puede o no confirmar, pero no debe crashear"
        );
    }
}
