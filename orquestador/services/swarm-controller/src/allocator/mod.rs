//! Weapon-Target Assignment (WTA).
//!
//! Tres estrategias:
//!   - `rl_allocator`:    PPO offline con policy network (feedforward 3 capas).
//!   - `hungarian_assign`: óptimo para n<=32 targets x m<=64 efectores en <50 ms.
//!   - `greedy_by_tti`:    heurística para escenarios saturados (priorizar TTI bajo).
//!
//! Orden de preferencia: RL → greedy_by_tti si >32x64 → Húngaro para tamaño pequeño.
//! Coste (Húngaro): c_ij = α·tiempo_intercept + β·(1 − Pk) + γ·munition_used

pub mod rl_allocator;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Target {
    pub id: String,
    pub priority: u8,           // 1..10
    pub tti_seconds: f64,       // Time to impact
    pub min_interceptors: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Interceptor {
    pub id: String,
    pub ready: bool,
    pub time_to_target_seconds: Vec<f64>, // por target en mismo orden
    pub pk_per_target: Vec<f64>,          // 0..1
    pub munition_remaining: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assignment {
    pub target_id: String,
    pub interceptor_id: String,
    pub estimated_pk: f64,
    pub time_to_intercept_s: f64,
}

const ALPHA: f64 = 1.0;   // peso tiempo
const BETA: f64 = 50.0;   // peso (1 - Pk)
const GAMMA: f64 = 0.1;   // peso munición

/// Coste de asignar el interceptor i al target j.
fn cost(int_idx: usize, tgt_idx: usize, interceptors: &[Interceptor], targets: &[Target]) -> f64 {
    let ic = &interceptors[int_idx];
    let t = &targets[tgt_idx];
    if !ic.ready || ic.munition_remaining == 0 {
        return f64::INFINITY;
    }
    let tti = ic.time_to_target_seconds[tgt_idx];
    if tti >= t.tti_seconds {
        return f64::INFINITY;
    }
    let pk = ic.pk_per_target[tgt_idx].clamp(0.01, 0.99);
    ALPHA * tti + BETA * (1.0 - pk) + GAMMA * (8 - ic.munition_remaining as i32).max(0) as f64
        - (t.priority as f64) * 2.0
}

/// Húngaro O(n^3). Para matrices rectangulares se infla con dummies coste 0.
pub fn hungarian_assign(targets: &[Target], interceptors: &[Interceptor]) -> Vec<Assignment> {
    let n = targets.len();
    let m = interceptors.len();
    if n == 0 || m == 0 {
        return Vec::new();
    }
    let size = n.max(m);
    let mut c = vec![vec![0.0f64; size]; size];
    for j in 0..n {
        for i in 0..m {
            c[j][i] = cost(i, j, interceptors, targets);
        }
        for i in m..size {
            c[j][i] = 1e6;
        }
    }
    for j in n..size {
        for i in 0..size {
            c[j][i] = 1e6;
        }
    }

    // Algoritmo Húngaro estándar (Kuhn-Munkres O(n^3)) con reducción de filas/columnas y aumento.
    // Implementación basada en versión clásica con etiquetas u/v.
    let inf = 1e18;
    let n_total = size;
    let mut u = vec![0.0; n_total + 1];
    let mut v = vec![0.0; n_total + 1];
    let mut p = vec![0usize; n_total + 1];
    let mut way = vec![0usize; n_total + 1];

    for i in 1..=n_total {
        p[0] = i;
        let mut j0 = 0usize;
        let mut minv = vec![inf; n_total + 1];
        let mut used = vec![false; n_total + 1];
        loop {
            used[j0] = true;
            let i0 = p[j0];
            let mut delta = inf;
            let mut j1 = 0usize;
            for j in 1..=n_total {
                if !used[j] {
                    let cur = c[i0 - 1][j - 1] - u[i0] - v[j];
                    if cur < minv[j] {
                        minv[j] = cur;
                        way[j] = j0;
                    }
                    if minv[j] < delta {
                        delta = minv[j];
                        j1 = j;
                    }
                }
            }
            for j in 0..=n_total {
                if used[j] {
                    u[p[j]] += delta;
                    v[j] -= delta;
                } else {
                    minv[j] -= delta;
                }
            }
            j0 = j1;
            if p[j0] == 0 {
                break;
            }
        }
        loop {
            let j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
            if j0 == 0 {
                break;
            }
        }
    }

    // p[j] = i  (1-indexed). j=target_padded_col, i=interceptor_padded_row.
    let mut out = Vec::new();
    for j in 1..=n_total {
        let i = p[j];
        if i == 0 {
            continue;
        }
        let ti = i - 1;
        let tj = j - 1;
        if ti >= m || tj >= n {
            continue;
        }
        if cost(ti, tj, interceptors, targets).is_finite() {
            out.push(Assignment {
                target_id: targets[tj].id.clone(),
                interceptor_id: interceptors[ti].id.clone(),
                estimated_pk: interceptors[ti].pk_per_target[tj],
                time_to_intercept_s: interceptors[ti].time_to_target_seconds[tj],
            });
        }
    }
    out
}

/// Heurística greedy para escenarios saturados.
/// Procesa targets en orden de TTI ascendente; para cada uno toma el interceptor
/// con mejor combinación (tiempo + Pk).
pub fn greedy_by_tti(targets: &[Target], interceptors: &[Interceptor]) -> Vec<Assignment> {
    let mut order: Vec<usize> = (0..targets.len()).collect();
    order.sort_by(|a, b| {
        targets[*a]
            .tti_seconds
            .partial_cmp(&targets[*b].tti_seconds)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut used = vec![false; interceptors.len()];
    let mut out = Vec::new();
    for tj in order {
        let mut best: Option<(usize, f64)> = None;
        for (i, ic) in interceptors.iter().enumerate() {
            if used[i] || !ic.ready || ic.munition_remaining == 0 {
                continue;
            }
            let c = cost(i, tj, interceptors, targets);
            if c.is_finite() && best.map_or(true, |(_, bc)| c < bc) {
                best = Some((i, c));
            }
        }
        if let Some((i, _)) = best {
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

/// Dispatcher: intenta RL primero (si hay policy), fallback a Húngaro o greedy.
pub fn assign(targets: &[Target], interceptors: &[Interceptor]) -> Vec<Assignment> {
    let rl = rl_allocator::RlAllocator::from_env();
    if rl.is_available() {
        let result = rl.assign(targets, interceptors);
        if !result.is_empty() || targets.is_empty() {
            return result;
        }
    }
    if targets.len() * interceptors.len() <= 32 * 64 {
        hungarian_assign(targets, interceptors)
    } else {
        greedy_by_tti(targets, interceptors)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(id: &str, tti: f64, pri: u8) -> Target {
        Target {
            id: id.into(),
            priority: pri,
            tti_seconds: tti,
            min_interceptors: 1,
        }
    }

    fn ic(id: &str, ttts: Vec<f64>, pks: Vec<f64>) -> Interceptor {
        Interceptor {
            id: id.into(),
            ready: true,
            time_to_target_seconds: ttts,
            pk_per_target: pks,
            munition_remaining: 2,
        }
    }

    #[test]
    fn hungarian_optimal_simple() {
        // 2 targets, 2 interceptors. Mejor: I1->T1, I2->T2
        let targets = vec![t("T1", 20.0, 5), t("T2", 25.0, 5)];
        let interceptors = vec![
            ic("I1", vec![5.0, 15.0], vec![0.9, 0.6]),
            ic("I2", vec![15.0, 6.0], vec![0.5, 0.95]),
        ];
        let a = hungarian_assign(&targets, &interceptors);
        let pairs: std::collections::HashMap<_, _> = a
            .iter()
            .map(|x| (x.target_id.clone(), x.interceptor_id.clone()))
            .collect();
        assert_eq!(pairs.get("T1").map(String::as_str), Some("I1"));
        assert_eq!(pairs.get("T2").map(String::as_str), Some("I2"));
    }

    #[test]
    fn greedy_respects_tti_priority() {
        let targets = vec![t("T_slow", 30.0, 3), t("T_imminent", 5.0, 9)];
        let interceptors = vec![ic("I1", vec![3.0, 4.0], vec![0.7, 0.8])];
        let a = greedy_by_tti(&targets, &interceptors);
        // El target inminente debe asignarse primero al único interceptor.
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].target_id, "T_imminent");
    }

    #[test]
    fn unfeasible_assignment_skipped() {
        let targets = vec![t("T1", 2.0, 5)]; // tti muy corto
        let interceptors = vec![ic("I1", vec![10.0], vec![0.9])]; // no llega a tiempo
        let a = hungarian_assign(&targets, &interceptors);
        assert!(a.is_empty(), "no debería asignar si no llega a tiempo: {a:?}");
    }
}
