//! Weapon-Target Assignment via Reinforcement Learning (PPO offline).
//!
//! Implementa un allocador basado en policy network entrenada offline con PPO.
//! La red es un feedforward de 3 capas implementado en Rust puro con nalgebra.
//!
//! Durante inferencia:
//! 1. Extrae features por par (target, interceptor)
//! 2. Cada par se evalúa con la policy network → Q-value
//! 3. Asignación greedy: para cada target, el interceptor con mayor Q
//!
//! Fallback: si el allocador RL falla (pesos no cargados), delega en
//! greedy_by_tti o hungarian_assign según tamaño del problema.

use serde::{Deserialize, Serialize};

use super::{Assignment, Interceptor, Target};

/// Número de features por par (target, interceptor).
const N_FEATURES: usize = 7;

/// Dimensiones de la policy network.
const HIDDEN1: usize = 32;
const HIDDEN2: usize = 16;

/// Umbral para RL vs fallback (mismo criterio que hungarian vs greedy).
const RL_MAX_PAIRS: usize = 32 * 64;

// ---------------------------------------------------------------------------
// Policy Network
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyNetwork {
    w1: Vec<f64>,
    b1: Vec<f64>,
    w2: Vec<f64>,
    b2: Vec<f64>,
    w3: Vec<f64>,
    b3: Vec<f64>,
}

impl PolicyNetwork {
    pub fn random() -> Self {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        Self {
            w1: (0..N_FEATURES * HIDDEN1).map(|_| rng.gen_range(-0.1..0.1)).collect(),
            b1: vec![0.0; HIDDEN1],
            w2: (0..HIDDEN1 * HIDDEN2).map(|_| rng.gen_range(-0.1..0.1)).collect(),
            b2: vec![0.0; HIDDEN2],
            w3: (0..HIDDEN2 * 1).map(|_| rng.gen_range(-0.1..0.1)).collect(),
            b3: vec![0.0; 1],
        }
    }

    pub fn from_weights(w1: Vec<f64>, b1: Vec<f64>, w2: Vec<f64>, b2: Vec<f64>, w3: Vec<f64>, b3: Vec<f64>) -> Self {
        Self { w1, b1, w2, b2, w3, b3 }
    }

    pub fn forward(&self, input: &[f64]) -> f64 {
        debug_assert_eq!(input.len(), N_FEATURES);

        let h1 = relu(&add_bias(&mul_vec_mat(input, &self.w1, N_FEATURES, HIDDEN1), &self.b1));
        let h2 = relu(&add_bias(&mul_vec_mat(&h1, &self.w2, HIDDEN1, HIDDEN2), &self.b2));
        let out = add_bias(&mul_vec_mat(&h2, &self.w3, HIDDEN2, 1), &self.b3);
        out[0]
    }
}

fn relu(v: &[f64]) -> Vec<f64> {
    v.iter().map(|x| x.max(0.0)).collect()
}

fn mul_vec_mat(v: &[f64], w: &[f64], n_in: usize, n_out: usize) -> Vec<f64> {
    let mut out = vec![0.0; n_out];
    for j in 0..n_out {
        let mut s = 0.0;
        for i in 0..n_in {
            s += v[i] * w[i * n_out + j];
        }
        out[j] = s;
    }
    out
}

fn add_bias(v: &[f64], b: &[f64]) -> Vec<f64> {
    v.iter().zip(b.iter()).map(|(x, y)| x + y).collect()
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

fn extract_features(target: &Target, interceptor: &Interceptor, tgt_idx: usize) -> [f64; N_FEATURES] {
    let tti_norm = (target.tti_seconds / 60.0).min(1.0);
    let priority_norm = (target.priority as f64) / 10.0;
    let min_int_norm = (target.min_interceptors as f64) / 10.0;
    let ready = if interceptor.ready { 1.0 } else { 0.0 };
    let mun_norm = (interceptor.munition_remaining as f64) / 8.0;
    let time_to_target = interceptor.time_to_target_seconds.get(tgt_idx).copied().unwrap_or(f64::MAX);
    let ttt_norm = (time_to_target / 60.0).min(1.0);
    let pk = interceptor.pk_per_target.get(tgt_idx).copied().unwrap_or(0.0);

    [
        priority_norm,
        tti_norm,
        min_int_norm,
        ready,
        mun_norm,
        ttt_norm,
        pk,
    ]
}

// ---------------------------------------------------------------------------
// RL Allocator
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct RlAllocator {
    policy: Option<PolicyNetwork>,
}

impl RlAllocator {
    pub fn new(policy: Option<PolicyNetwork>) -> Self {
        Self { policy }
    }

    pub fn from_env() -> Self {
        let policy = std::env::var("RL_POLICY_WEIGHTS_PATH")
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str::<PolicyNetwork>(&s).ok());
        Self { policy }
    }

    pub fn is_available(&self) -> bool {
        self.policy.is_some()
    }

    pub fn set_policy(&mut self, policy: PolicyNetwork) {
        self.policy = Some(policy);
    }

    /// Asigna targets a interceptores usando la policy network.
    /// Para cada target, escoge greedy el interceptor con mayor Q-value.
    fn rl_assign(&self, targets: &[Target], interceptors: &[Interceptor]) -> Vec<Assignment> {
        let policy = match &self.policy {
            Some(p) => p,
            None => return Vec::new(),
        };

        let mut used = vec![false; interceptors.len()];
        let mut out = Vec::new();

        // Ordenar targets por TTI (más urgente primero)
        let mut order: Vec<usize> = (0..targets.len()).collect();
        order.sort_by(|a, b| {
            targets[*a]
                .tti_seconds
                .partial_cmp(&targets[*b].tti_seconds)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        for &tj in &order {
            let mut best_q = f64::NEG_INFINITY;
            let mut best_idx = None;

            for (i, ic) in interceptors.iter().enumerate() {
                if used[i] || !ic.ready || ic.munition_remaining == 0 {
                    continue;
                }

                // Verificar factibilidad
                let tti_ic = ic.time_to_target_seconds.get(tj).copied().unwrap_or(f64::MAX);
                if tti_ic >= targets[tj].tti_seconds {
                    continue;
                }

                let features = extract_features(&targets[tj], ic, tj);
                let q = policy.forward(&features);

                if q > best_q {
                    best_q = q;
                    best_idx = Some(i);
                }
            }

            if let Some(i) = best_idx {
                used[i] = true;
                out.push(Assignment {
                    target_id: targets[tj].id.clone(),
                    interceptor_id: interceptors[i].id.clone(),
                    estimated_pk: interceptors[i].pk_per_target[tj],
                    time_to_intercept_s: interceptors[i].time_to_target_seconds[tj],
                });
            }
        }

        out
    }

    /// Dispatcher: intenta RL primero, fallback a greedy_by_tti o hungarian.
    pub fn assign(&self, targets: &[Target], interceptors: &[Interceptor]) -> Vec<Assignment> {
        if self.policy.is_some() {
            let result = self.rl_assign(targets, interceptors);
            if !result.is_empty() || targets.is_empty() {
                return result;
            }
            // RL devolvió vacío pero hay targets → fallback
        }

        // Fallback: mismo criterio que el dispatcher original
        if targets.len() * interceptors.len() <= RL_MAX_PAIRS {
            super::hungarian_assign(targets, interceptors)
        } else {
            super::greedy_by_tti(targets, interceptors)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sample_targets() -> Vec<Target> {
        vec![
            Target {
                id: "T1".into(),
                priority: 8,
                tti_seconds: 15.0,
                min_interceptors: 1,
            },
            Target {
                id: "T2".into(),
                priority: 5,
                tti_seconds: 30.0,
                min_interceptors: 1,
            },
        ]
    }

    fn make_sample_interceptors() -> Vec<Interceptor> {
        vec![
            Interceptor {
                id: "I1".into(),
                ready: true,
                time_to_target_seconds: vec![5.0, 12.0],
                pk_per_target: vec![0.9, 0.6],
                munition_remaining: 2,
            },
            Interceptor {
                id: "I2".into(),
                ready: true,
                time_to_target_seconds: vec![10.0, 6.0],
                pk_per_target: vec![0.5, 0.95],
                munition_remaining: 1,
            },
        ]
    }

    #[test]
    fn rl_allocator_output_shape() {
        let alloc = RlAllocator::new(Some(PolicyNetwork::random()));
        let targets = make_sample_targets();
        let interceptors = make_sample_interceptors();
        let result = alloc.assign(&targets, &interceptors);
        assert!(result.len() <= targets.len(), "asignaciones no pueden exceder targets");
        for a in &result {
            assert!(!a.target_id.is_empty());
            assert!(!a.interceptor_id.is_empty());
            assert!(a.estimated_pk >= 0.0 && a.estimated_pk <= 1.0);
        }
    }

    #[test]
    fn rl_allocator_deterministic() {
        let policy = PolicyNetwork::random();
        let alloc = RlAllocator::new(Some(policy.clone()));
        let targets = make_sample_targets();
        let interceptors = make_sample_interceptors();

        let result1 = alloc.assign(&targets, &interceptors);
        let result2 = alloc.assign(&targets, &interceptors);

        assert_eq!(result1.len(), result2.len());
        for (a, b) in result1.iter().zip(result2.iter()) {
            assert_eq!(a.target_id, b.target_id);
            assert_eq!(a.interceptor_id, b.interceptor_id);
        }
    }

    #[test]
    fn rl_allocator_fallback_on_empty_policy() {
        let alloc = RlAllocator::new(None);
        let targets = make_sample_targets();
        let interceptors = make_sample_interceptors();
        // Sin policy, debe caer en fallback (hungarian) y producir asignaciones
        let result = alloc.assign(&targets, &interceptors);
        assert!(!result.is_empty(), "fallback debe producir al menos una asignación");
    }

    #[test]
    fn rl_allocator_fallback_when_no_solution() {
        // Targets con TTI extremadamente corto, ningún interceptor llega
        let targets = vec![Target {
            id: "T1".into(),
            priority: 5,
            tti_seconds: 0.1,
            min_interceptors: 1,
        }];
        let interceptors = vec![Interceptor {
            id: "I1".into(),
            ready: true,
            time_to_target_seconds: vec![10.0],
            pk_per_target: vec![0.9],
            munition_remaining: 1,
        }];
        let alloc = RlAllocator::new(Some(PolicyNetwork::random()));
        let result = alloc.assign(&targets, &interceptors);
        assert!(result.is_empty(), "sin solución factible debe devolver vacío");
    }

    #[test]
    fn q_values_are_finite() {
        let policy = PolicyNetwork::random();
        let targets = make_sample_targets();
        let interceptors = make_sample_interceptors();

        for tj in 0..targets.len() {
            for (i, ic) in interceptors.iter().enumerate() {
                let features = extract_features(&targets[tj], ic, tj);
                let q = policy.forward(&features);
                assert!(q.is_finite(), "Q-value debe ser finito, got {}", q);
            }
        }
    }

    #[test]
    fn network_random_weights_non_zero() {
        let p = PolicyNetwork::random();
        let has_nonzero = p.w1.iter().any(|x| *x != 0.0);
        assert!(has_nonzero, "pesos aleatorios no deben ser todos cero");
    }
}
