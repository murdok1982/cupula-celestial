//! Tests de integración para el RL Allocator.
//!
//! Verifica:
//! - Sanity: output shape correcto y valores en rango
//! - Determinismo: misma entrada → misma salida
//! - Degradado: fallback funciona si RL no disponible

use swarm_controller::allocator::rl_allocator::{PolicyNetwork, RlAllocator};
use swarm_controller::allocator::{Interceptor, Target};

fn sample_targets() -> Vec<Target> {
    vec![
        Target { id: "T1".into(), priority: 9, tti_seconds: 10.0, min_interceptors: 1 },
        Target { id: "T2".into(), priority: 5, tti_seconds: 25.0, min_interceptors: 1 },
        Target { id: "T3".into(), priority: 7, tti_seconds: 18.0, min_interceptors: 2 },
    ]
}

fn sample_interceptors() -> Vec<Interceptor> {
    vec![
        Interceptor {
            id: "I1".into(), ready: true,
            time_to_target_seconds: vec![4.0, 10.0, 8.0],
            pk_per_target: vec![0.95, 0.5, 0.75],
            munition_remaining: 3,
        },
        Interceptor {
            id: "I2".into(), ready: true,
            time_to_target_seconds: vec![8.0, 5.0, 6.0],
            pk_per_target: vec![0.6, 0.92, 0.8],
            munition_remaining: 2,
        },
        Interceptor {
            id: "I3".into(), ready: false,
            time_to_target_seconds: vec![2.0, 3.0, 4.0],
            pk_per_target: vec![0.99, 0.99, 0.99],
            munition_remaining: 1,
        },
        Interceptor {
            id: "I4".into(), ready: true,
            time_to_target_seconds: vec![12.0, 14.0, 9.0],
            pk_per_target: vec![0.7, 0.65, 0.85],
            munition_remaining: 1,
        },
    ]
}

#[test]
fn rl_allocator_sanity_check() {
    let alloc = RlAllocator::new(Some(PolicyNetwork::random()));
    let targets = sample_targets();
    let interceptors = sample_interceptors();
    let result = alloc.assign(&targets, &interceptors);

    // No más asignaciones que targets
    assert!(result.len() <= targets.len(), "output shape: asignaciones ({}) <= targets ({})", result.len(), targets.len());

    // No más asignaciones que interceptores disponibles
    let n_ready = interceptors.iter().filter(|i| i.ready).count();
    assert!(result.len() <= n_ready, "asignaciones ({}) <= efectores listos ({})", result.len(), n_ready);

    // Cada asignación tiene IDs no vacíos
    for a in &result {
        assert!(!a.target_id.is_empty(), "target_id no vacío");
        assert!(!a.interceptor_id.is_empty(), "interceptor_id no vacío");
        assert!(a.estimated_pk >= 0.0 && a.estimated_pk <= 1.0,
            "Pk {:.3} debe estar en [0,1]", a.estimated_pk);
        assert!(a.time_to_intercept_s >= 0.0, "TTI {:.3} debe ser >= 0", a.time_to_intercept_s);
    }
}

#[test]
fn rl_allocator_determinism() {
    let policy = PolicyNetwork::random();
    let alloc = RlAllocator::new(Some(policy));
    let targets = sample_targets();
    let interceptors = sample_interceptors();

    let r1 = alloc.assign(&targets, &interceptors);
    let r2 = alloc.assign(&targets, &interceptors);

    // Misma cantidad de asignaciones
    assert_eq!(r1.len(), r2.len(), "mismo número de asignaciones");

    // Mismas asignaciones (mismo par target-interceptor)
    let mut pairs1: Vec<(String, String)> = r1.iter().map(|a| (a.target_id.clone(), a.interceptor_id.clone())).collect();
    let mut pairs2: Vec<(String, String)> = r2.iter().map(|a| (a.target_id.clone(), a.interceptor_id.clone())).collect();
    pairs1.sort();
    pairs2.sort();
    assert_eq!(pairs1, pairs2, "asignaciones deterministas");
}

#[test]
fn rl_allocator_fallback_when_no_policy() {
    let alloc = RlAllocator::new(None);
    assert!(!alloc.is_available(), "sin policy, is_available = false");

    let targets = sample_targets();
    let interceptors = sample_interceptors();

    // Sin policy, debe caer en fallback (hungarian) y devolver asignaciones
    let result = alloc.assign(&targets, &interceptors);
    assert!(!result.is_empty(), "fallback debe producir asignaciones");

    // Verificar que las asignaciones del fallback son válidas
    let assigned_targets: std::collections::HashSet<String> =
        result.iter().map(|a| a.target_id.clone()).collect();
    for t in assigned_targets {
        assert!(targets.iter().any(|x| x.id == t), "target '{}' debe existir", t);
    }
}
