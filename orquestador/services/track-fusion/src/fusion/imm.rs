//! Interacting Multiple Model (IMM): mezcla 3 filtros Kalman con probabilidades de modo.
//!
//! Ciclo por step:
//!   1. Interaction (mixing): cada modo recibe una mezcla ponderada de los demás.
//!   2. Predict: cada filtro avanza dt.
//!   3. Update: si hay medida, cada filtro actualiza, devuelve verosimilitud.
//!   4. Mode probability update: μ_i ∝ Λ_i · Σ_j π_ji μ_j  (Bayes con transición Markov).
//!   5. Output combination: x̂ = Σ μ_i x_i,  P = Σ μ_i (P_i + (x_i-x̂)(x_i-x̂)^T).

use nalgebra::SMatrix;

use crate::fusion::kalman::KalmanFilter;
use crate::types::{ImmMode, MeasCov, Measurement, StateCov, StateVec};

const MODES: [ImmMode; 3] = [ImmMode::Cv, ImmMode::Ca, ImmMode::Ct];

/// Matriz de transición Markov entre modos (filas suman 1).
fn markov_transitions() -> SMatrix<f64, 3, 3> {
    SMatrix::<f64, 3, 3>::new(
        0.90, 0.07, 0.03, // CV -> {CV, CA, CT}
        0.10, 0.80, 0.10, // CA -> {...}
        0.05, 0.15, 0.80, // CT -> {...}
    )
}

#[derive(Debug, Clone)]
pub struct ImmFilter {
    pub filters: Vec<KalmanFilter>,
    pub mode_probs: [f64; 3], // [CV, CA, CT]
    pub pi: SMatrix<f64, 3, 3>,
}

impl ImmFilter {
    pub fn new(x0: StateVec, p0: StateCov) -> Self {
        let filters = MODES
            .iter()
            .copied()
            .map(|m| KalmanFilter::new(m, x0, p0))
            .collect();
        Self {
            filters,
            mode_probs: [0.34, 0.33, 0.33],
            pi: markov_transitions(),
        }
    }

    /// Paso 1: mezclar estados (mixing). Ver Bar-Shalom & Li, IMM algorithm.
    fn interact(&mut self) {
        let mut c = [0.0f64; 3];
        for j in 0..3 {
            for i in 0..3 {
                c[j] += self.pi[(i, j)] * self.mode_probs[i];
            }
        }
        let mut mu_ij = [[0.0f64; 3]; 3];
        for j in 0..3 {
            for i in 0..3 {
                mu_ij[i][j] = if c[j] > 1e-12 {
                    self.pi[(i, j)] * self.mode_probs[i] / c[j]
                } else {
                    0.0
                };
            }
        }
        let old = self.filters.clone();

        for j in 0..3 {
            let mut x0j = StateVec::zeros();
            for i in 0..3 {
                x0j += mu_ij[i][j] * old[i].x;
            }
            let mut p0j = StateCov::zeros();
            for i in 0..3 {
                let dx = old[i].x - x0j;
                p0j += mu_ij[i][j] * (old[i].p + dx * dx.transpose());
            }
            self.filters[j].x = x0j;
            self.filters[j].p = p0j;
        }
    }

    pub fn predict(&mut self, dt: f64) {
        self.interact();
        for f in &mut self.filters {
            f.predict(dt);
        }
    }

    /// Actualiza con medida. Devuelve verosimilitud total (suma ponderada).
    pub fn update(&mut self, z: &Measurement, r: &MeasCov) -> f64 {
        let mut likelihoods = [0.0f64; 3];
        for (i, f) in self.filters.iter_mut().enumerate() {
            let (_y, l) = f.update(z, r);
            likelihoods[i] = l.max(1e-30);
        }
        // c_j = Σ_i π_ij μ_i (igual que interact, pero ya usado: recalculamos por claridad)
        let mut c_norm = [0.0f64; 3];
        for j in 0..3 {
            for i in 0..3 {
                c_norm[j] += self.pi[(i, j)] * self.mode_probs[i];
            }
        }
        let mut new_mu = [0.0f64; 3];
        for j in 0..3 {
            new_mu[j] = likelihoods[j] * c_norm[j];
        }
        let sum: f64 = new_mu.iter().sum::<f64>().max(1e-30);
        for j in 0..3 {
            new_mu[j] /= sum;
        }
        self.mode_probs = new_mu;
        sum
    }

    /// Combinación de salida del IMM.
    pub fn combined_state(&self) -> (StateVec, StateCov) {
        let mut x = StateVec::zeros();
        for i in 0..3 {
            x += self.mode_probs[i] * self.filters[i].x;
        }
        let mut p = StateCov::zeros();
        for i in 0..3 {
            let dx = self.filters[i].x - x;
            p += self.mode_probs[i] * (self.filters[i].p + dx * dx.transpose());
        }
        (x, p)
    }

    pub fn dominant_mode(&self) -> ImmMode {
        let mut best = 0usize;
        for i in 1..3 {
            if self.mode_probs[i] > self.mode_probs[best] {
                best = i;
            }
        }
        MODES[best]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nalgebra::Matrix3;

    #[test]
    fn imm_mode_probs_sum_to_one_after_update() {
        let mut x0 = StateVec::zeros();
        x0[3] = 5.0;
        let p0 = StateCov::identity() * 10.0;
        let mut imm = ImmFilter::new(x0, p0);

        let r = Matrix3::identity() * 1.0;

        for step in 1..=10 {
            imm.predict(1.0);
            let z = Measurement::new(5.0 * step as f64, 0.0, 0.0);
            imm.update(&z, &r);
            let s: f64 = imm.mode_probs.iter().sum();
            assert!((s - 1.0).abs() < 1e-6, "probs no normalizadas: {s}");
        }
    }

    #[test]
    fn imm_picks_cv_for_constant_velocity_target() {
        let mut x0 = StateVec::zeros();
        x0[3] = 10.0;
        let p0 = StateCov::identity() * 5.0;
        let mut imm = ImmFilter::new(x0, p0);
        let r = Matrix3::identity() * 0.5;

        for k in 1..=20 {
            imm.predict(1.0);
            let z = Measurement::new(10.0 * k as f64, 0.0, 0.0);
            imm.update(&z, &r);
        }
        assert_eq!(
            imm.dominant_mode(),
            ImmMode::Cv,
            "esperado CV dominante con target CV, probs={:?}",
            imm.mode_probs
        );
    }

    #[test]
    fn imm_ct_dominant_for_turning_target() {
        let mut x0 = StateVec::zeros();
        x0[3] = 10.0;
        x0[4] = 0.0;
        let p0 = StateCov::identity() * 5.0;
        let mut imm = ImmFilter::new(x0, p0);
        let r = Matrix3::identity() * 0.5;
        let omega = 0.35;
        for k in 1..=30 {
            imm.predict(1.0);
            let t = k as f64;
            let x = 10.0 * (omega * t).sin() / omega;
            let y = 10.0 * (1.0 - (omega * t).cos()) / omega;
            let z = Measurement::new(x, y, 0.0);
            imm.update(&z, &r);
        }
        assert_eq!(
            imm.dominant_mode(),
            ImmMode::Ct,
            "esperado CT dominante en giro, probs={:?}",
            imm.mode_probs
        );
    }

    #[test]
    fn imm_ca_dominant_for_accelerating_target() {
        let mut x0 = StateVec::zeros();
        x0[3] = 5.0;
        x0[6] = 2.0;
        let p0 = StateCov::identity() * 5.0;
        let mut imm = ImmFilter::new(x0, p0);
        let r = Matrix3::identity() * 0.5;
        for k in 1..=20 {
            imm.predict(1.0);
            let z = Measurement::new(5.0 * k as f64 + k as f64 * k as f64, 0.0, 0.0);
            imm.update(&z, &r);
        }
        assert_eq!(
            imm.dominant_mode(),
            ImmMode::Ca,
            "esperado CA dominante en aceleracion, probs={:?}",
            imm.mode_probs
        );
    }
}
