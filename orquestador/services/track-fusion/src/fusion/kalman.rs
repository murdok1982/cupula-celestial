//! Filtro Kalman extendido para estado 9D = [p; v; a] con medida posicional 3D.
//!
//! Tres modelos de movimiento:
//!   - CV (Constant Velocity)        — aceleración asumida ruido blanco.
//!   - CA (Constant Acceleration)    — modelo completo con jerk como ruido.
//!   - CT (Coordinated Turn)         — giro a velocidad de yaw constante en plano XY.
//!
//! La medida H es lineal (extrae posición), por lo que basta Kalman estándar.

use nalgebra::{Matrix3, SMatrix};

use crate::types::{ImmMode, MeasCov, Measurement, StateCov, StateVec};

const POS_PROCESS_NOISE: f64 = 0.5; // m^2/s^4   (jerk)
const TURN_RATE_RAD_S: f64 = 0.35;  // ~20 deg/s para modo CT

/// Una instancia del filtro para un modo concreto.
#[derive(Debug, Clone)]
pub struct KalmanFilter {
    pub mode: ImmMode,
    pub x: StateVec,
    pub p: StateCov,
}

impl KalmanFilter {
    pub fn new(mode: ImmMode, x: StateVec, p: StateCov) -> Self {
        Self { mode, x, p }
    }

    /// Predicción: x_k+1|k = F x_k|k    P_k+1|k = F P F^T + Q
    pub fn predict(&mut self, dt: f64) {
        let f = transition_matrix(self.mode, dt);
        let q = process_noise(self.mode, dt);
        self.x = f * self.x;
        self.p = f * self.p * f.transpose() + q;
        symmetrize(&mut self.p);
    }

    /// Update con medida 3D (posición).
    ///
    /// Devuelve (residual, likelihood_gaussiana) para fusión IMM.
    pub fn update(&mut self, z: &Measurement, r: &MeasCov) -> (Measurement, f64) {
        let h = measurement_matrix();
        let y = z - h * self.x;
        let s = h * self.p * h.transpose() + r;
        let s_inv = s.try_inverse().unwrap_or_else(|| {
            // Regularización: añadir epsilon si singular.
            (s + Matrix3::identity() * 1e-6)
                .try_inverse()
                .expect("S singular incluso regularizada")
        });
        let k = self.p * h.transpose() * s_inv;
        self.x += k * y;
        let i_kh = StateCov::identity() - k * h;
        self.p = i_kh * self.p * i_kh.transpose() + k * r * k.transpose();
        symmetrize(&mut self.p);

        let det = s.determinant().abs().max(1e-12);
        let mhal = (y.transpose() * s_inv * y)[(0, 0)].max(0.0);
        let likelihood = (-0.5 * mhal).exp() / ((2.0 * std::f64::consts::PI).powi(3) * det).sqrt();

        (y, likelihood)
    }

    pub fn position(&self) -> Measurement {
        Measurement::new(self.x[0], self.x[1], self.x[2])
    }

    pub fn velocity(&self) -> Measurement {
        Measurement::new(self.x[3], self.x[4], self.x[5])
    }
}

/// H = [I3 | 0 | 0]
pub fn measurement_matrix() -> SMatrix<f64, 3, 9> {
    let mut h = SMatrix::<f64, 3, 9>::zeros();
    h[(0, 0)] = 1.0;
    h[(1, 1)] = 1.0;
    h[(2, 2)] = 1.0;
    h
}

/// Matriz de transición F(dt) según modo.
pub fn transition_matrix(mode: ImmMode, dt: f64) -> StateCov {
    let mut f = StateCov::identity();
    // Para los 3 modos: p += v*dt + 0.5 a dt^2
    let dt2 = 0.5 * dt * dt;
    for i in 0..3 {
        f[(i, i + 3)] = dt;
        f[(i, i + 6)] = dt2;
        f[(i + 3, i + 6)] = dt;
    }
    match mode {
        ImmMode::Cv => {
            // CV: acel = 0 -> elementos relativos a a se anulan.
            for i in 0..3 {
                f[(i, i + 6)] = 0.0;
                f[(i + 3, i + 6)] = 0.0;
                f[(i + 6, i + 6)] = 0.0;
            }
        }
        ImmMode::Ca => { /* matriz cinemática completa */ }
        ImmMode::Ct => {
            // Coordinated turn en plano XY a velocidad angular ω.
            let omega = TURN_RATE_RAD_S;
            let s = (omega * dt).sin();
            let c = (omega * dt).cos();
            // x' = x + sin(ω dt)/ω vx - (1-cos(ω dt))/ω vy
            // y' = y + (1-cos(ω dt))/ω vx + sin(ω dt)/ω vy
            // vx' = c vx - s vy
            // vy' = s vx + c vy
            let s_w = s / omega;
            let c_w = (1.0 - c) / omega;
            f[(0, 3)] = s_w;
            f[(0, 4)] = -c_w;
            f[(1, 3)] = c_w;
            f[(1, 4)] = s_w;
            f[(3, 3)] = c;
            f[(3, 4)] = -s;
            f[(4, 3)] = s;
            f[(4, 4)] = c;
            // Aceleración considerada ruido en CT
            for i in 0..3 {
                f[(i, i + 6)] = 0.0;
                f[(i + 3, i + 6)] = 0.0;
                f[(i + 6, i + 6)] = 0.0;
            }
        }
    }
    f
}

/// Ruido de proceso Q según modo (discretizado por aceleración / jerk blanco).
pub fn process_noise(mode: ImmMode, dt: f64) -> StateCov {
    let mut q = StateCov::zeros();
    match mode {
        ImmMode::Cv => {
            // Q = sigma^2 * G G^T  con G = [dt^2/2; dt; 0]_xyz
            let sigma2 = 1.0; // varianza aceleración (m/s^2)^2
            let dt2 = dt * dt;
            let dt3 = dt2 * dt;
            let dt4 = dt3 * dt;
            for i in 0..3 {
                q[(i, i)] = dt4 / 4.0 * sigma2;
                q[(i, i + 3)] = dt3 / 2.0 * sigma2;
                q[(i + 3, i)] = dt3 / 2.0 * sigma2;
                q[(i + 3, i + 3)] = dt2 * sigma2;
            }
        }
        ImmMode::Ca => {
            // Modelo de jerk continuo blanco
            let s = POS_PROCESS_NOISE;
            let dt2 = dt * dt;
            let dt3 = dt2 * dt;
            let dt4 = dt3 * dt;
            let dt5 = dt4 * dt;
            for i in 0..3 {
                q[(i, i)] = dt5 / 20.0 * s;
                q[(i, i + 3)] = dt4 / 8.0 * s;
                q[(i, i + 6)] = dt3 / 6.0 * s;
                q[(i + 3, i)] = dt4 / 8.0 * s;
                q[(i + 3, i + 3)] = dt3 / 3.0 * s;
                q[(i + 3, i + 6)] = dt2 / 2.0 * s;
                q[(i + 6, i)] = dt3 / 6.0 * s;
                q[(i + 6, i + 3)] = dt2 / 2.0 * s;
                q[(i + 6, i + 6)] = dt * s;
            }
        }
        ImmMode::Ct => {
            // Mayor ruido lateral por la inexactitud del modelo CT
            let sigma2 = 4.0;
            let dt2 = dt * dt;
            let dt3 = dt2 * dt;
            let dt4 = dt3 * dt;
            for i in 0..3 {
                q[(i, i)] = dt4 / 4.0 * sigma2;
                q[(i, i + 3)] = dt3 / 2.0 * sigma2;
                q[(i + 3, i)] = dt3 / 2.0 * sigma2;
                q[(i + 3, i + 3)] = dt2 * sigma2;
            }
        }
    }
    q
}

fn symmetrize(p: &mut StateCov) {
    *p = 0.5 * (*p + p.transpose());
}

#[cfg(test)]
mod tests {
    use super::*;
    use nalgebra::Matrix3;

    fn init_state_at(x: f64) -> (StateVec, StateCov) {
        let mut s = StateVec::zeros();
        s[0] = x;
        let mut p = StateCov::identity() * 10.0;
        // varianza grande en aceleración
        for i in 6..9 {
            p[(i, i)] = 100.0;
        }
        (s, p)
    }

    #[test]
    fn cv_predict_advances_position() {
        let (x, p) = init_state_at(0.0);
        let mut kf = KalmanFilter::new(ImmMode::Cv, x, p);
        kf.x[3] = 10.0; // vx = 10 m/s
        kf.predict(1.0);
        assert!((kf.x[0] - 10.0).abs() < 1e-9, "esperado 10m, got {}", kf.x[0]);
    }

    #[test]
    fn ca_predict_uses_acceleration() {
        let (x, p) = init_state_at(0.0);
        let mut kf = KalmanFilter::new(ImmMode::Ca, x, p);
        kf.x[3] = 5.0;
        kf.x[6] = 2.0;
        kf.predict(2.0);
        // px = 0 + 5*2 + 0.5*2*4 = 14
        assert!((kf.x[0] - 14.0).abs() < 1e-9);
    }

    #[test]
    fn update_reduces_covariance() {
        let (x, p) = init_state_at(0.0);
        let mut kf = KalmanFilter::new(ImmMode::Ca, x, p);
        let p_before = kf.p[(0, 0)];
        let z = Measurement::new(1.0, 0.0, 0.0);
        let r = Matrix3::identity() * 0.1;
        let (_y, lik) = kf.update(&z, &r);
        assert!(kf.p[(0, 0)] < p_before, "P debería decrecer");
        assert!(lik > 0.0);
    }

    #[test]
    fn ct_rotates_velocity() {
        let (x, p) = init_state_at(0.0);
        let mut kf = KalmanFilter::new(ImmMode::Ct, x, p);
        kf.x[3] = 10.0;
        kf.x[4] = 0.0;
        kf.predict(1.0);
        // Tras 1s con ω ≈ 0.35 rad/s, vy debe ser no cero.
        assert!(kf.x[4].abs() > 1e-3);
    }

    #[test]
    fn kalman_no_movement_cv_zero() {
        let (mut x, p) = init_state_at(10.0);
        x[3] = 0.0;
        x[4] = 0.0;
        x[5] = 0.0;
        let mut kf = KalmanFilter::new(ImmMode::Cv, x, p);
        kf.predict(5.0);
        assert!((kf.x[0] - 10.0).abs() < 1e-9, "sin velocidad, posicion constante");
        assert!((kf.x[1] - 0.0).abs() < 1e-9);
    }

    #[test]
    fn kalman_constant_acceleration_100_steps() {
        let (mut x, p) = init_state_at(0.0);
        x[3] = 0.0;
        x[6] = 2.0;
        let mut kf = KalmanFilter::new(ImmMode::Ca, x, p);
        for _ in 0..100 {
            kf.predict(0.1);
        }
        let expected_px = 0.5 * 2.0 * (10.0_f64).powi(2);
        assert!(
            (kf.x[0] - expected_px).abs() < 1.0,
            "CA 100 steps: esperado ~{} px, obtenido {}",
            expected_px,
            kf.x[0]
        );
    }

    #[test]
    fn kalman_covariance_non_negative() {
        let (x, p) = init_state_at(0.0);
        let mut kf = KalmanFilter::new(ImmMode::Ca, x, p);
        for step in 1..=20 {
            kf.predict(0.5);
            let z = Measurement::new(step as f64 * 2.0, 0.0, 0.0);
            let r = Matrix3::identity() * 0.5;
            kf.update(&z, &r);
            for i in 0..9 {
                assert!(
                    kf.p[(i, i)] >= 0.0,
                    "varianza negativa en diagonal {} en step {}",
                    i,
                    step
                );
            }
        }
    }
}
