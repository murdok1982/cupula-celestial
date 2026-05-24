//! Test de integración: track-fusion procesa una traza completa de un Shahed-like.
//!
//! Para ejecutar: este archivo es un test independiente que no usa el binario
//! (sólo la lib). Compilar con `cargo test --workspace`.

use chrono::{Duration, Utc};
use track_fusion::tracker::{TrackManager, TrackerConfig};
use track_fusion::types::SensorObservation;

#[test]
fn shahed_like_trajectory_creates_confirmed_track() {
    let mut tm = TrackManager::new(TrackerConfig {
        confirm_m: 3,
        confirm_n: 5,
        gate: 50.0,
    });
    let t0 = Utc::now();

    // Trayectoria recta, 60 m/s, 10 samples a 200 ms.
    for k in 0..10 {
        let obs = SensorObservation {
            sensor_id: "RAD-AESA-MAD-01".into(),
            sensor_type: "RADAR_AESA".into(),
            timestamp: t0 + Duration::milliseconds(k * 200),
            enu_xyz_m: [k as f64 * 12.0, 0.0, 300.0],
            latitude: 40.470 - k as f64 * 0.0008,
            longitude: -3.640 - k as f64 * 0.0008,
            altitude_msl_m: 800.0,
            altitude_agl_m: 300.0,
            snr_db: 22.0,
            quality: 0.9,
            doppler_mps: 60.0,
            rcs_dbsm: -15.0,
        };
        let _ = tm.step(&[obs]);
    }

    let confirmed = tm.tracks.values().filter(|t| t.confirmed).count();
    assert!(
        confirmed >= 1,
        "se esperaba al menos 1 track confirmado, había {confirmed}"
    );

    // Velocidad estimada debe estar próxima a 60 m/s
    let t = tm.tracks.values().find(|t| t.confirmed).unwrap();
    let (x, _) = t.imm.combined_state();
    let speed = (x[3] * x[3] + x[4] * x[4] + x[5] * x[5]).sqrt();
    assert!(
        speed > 30.0 && speed < 90.0,
        "velocidad estimada fuera de rango: {speed}"
    );
}
