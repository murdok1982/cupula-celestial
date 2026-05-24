//! Asociación medida-pista basada en distancia de Mahalanobis + algoritmo Auction.
//!
//! El Auction algorithm (Bertsekas) resuelve un problema de asignación rectangular
//! en O(n²) amortizado. Más simple y robusto que el Húngaro para online.

use nalgebra::DMatrix;

/// Resultado: track_idx -> measurement_idx (None si no se asoció).
pub fn auction_assign(cost: &DMatrix<f64>, max_iter: usize) -> Vec<Option<usize>> {
    let n_tracks = cost.nrows();
    let n_meas = cost.ncols();
    if n_tracks == 0 || n_meas == 0 {
        return vec![None; n_tracks];
    }

    // Convertimos coste -> beneficio: a_ij = -c_ij  (Auction maximiza)
    let benefit = -cost.clone();

    let mut prices = vec![0.0f64; n_meas];
    let mut assignment: Vec<Option<usize>> = vec![None; n_tracks];
    let mut owner: Vec<Option<usize>> = vec![None; n_meas]; // meas_idx -> track_idx

    let epsilon = 1.0 / ((n_tracks + n_meas) as f64).max(1.0);

    for _ in 0..max_iter {
        // Buscar un track sin asignar
        let unassigned = match assignment.iter().position(Option::is_none) {
            Some(t) => t,
            None => break,
        };

        // Calcular valor neto v_ij = a_ij - p_j para cada medida
        let mut best = (f64::NEG_INFINITY, 0usize);
        let mut second = f64::NEG_INFINITY;
        for j in 0..n_meas {
            let v = benefit[(unassigned, j)] - prices[j];
            if v > best.0 {
                second = best.0;
                best = (v, j);
            } else if v > second {
                second = v;
            }
        }
        if second == f64::NEG_INFINITY {
            second = best.0;
        }
        // Bid del unassigned: incrementa precio de la mejor medida
        let bid_increment = (best.0 - second).abs() + epsilon;
        let j = best.1;
        prices[j] += bid_increment;

        // Reasignar
        if let Some(prev_owner) = owner[j] {
            assignment[prev_owner] = None;
        }
        assignment[unassigned] = Some(j);
        owner[j] = Some(unassigned);

        // Bloqueo de divergencia: si bid_increment es 0, salimos.
        if bid_increment <= 0.0 {
            break;
        }
    }

    assignment
}

/// Filtra las asignaciones por gating de Mahalanobis (umbral).
pub fn filter_by_gate(
    cost: &DMatrix<f64>,
    assignment: Vec<Option<usize>>,
    gate_threshold: f64,
) -> Vec<Option<usize>> {
    assignment
        .into_iter()
        .enumerate()
        .map(|(t, m_opt)| match m_opt {
            Some(m) if cost[(t, m)] <= gate_threshold => Some(m),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auction_assigns_lowest_cost_pairs() {
        // 3 tracks x 3 meas. Diagonal es la mejor opción.
        let cost = DMatrix::from_row_slice(
            3,
            3,
            &[
                0.1, 9.0, 9.0, //
                9.0, 0.2, 9.0, //
                9.0, 9.0, 0.3, //
            ],
        );
        let a = auction_assign(&cost, 1_000);
        assert_eq!(a, vec![Some(0), Some(1), Some(2)]);
    }

    #[test]
    fn auction_handles_rectangular() {
        // 2 tracks x 3 meas
        let cost = DMatrix::from_row_slice(
            2,
            3,
            &[
                1.0, 5.0, 9.0, //
                4.0, 2.0, 7.0, //
            ],
        );
        let a = auction_assign(&cost, 1_000);
        assert_eq!(a[0], Some(0));
        assert_eq!(a[1], Some(1));
    }

    #[test]
    fn gate_rejects_far_associations() {
        let cost = DMatrix::from_row_slice(2, 2, &[0.5, 99.0, 99.0, 0.5]);
        let a = auction_assign(&cost, 100);
        let g = filter_by_gate(&cost, a, 1.0);
        assert_eq!(g, vec![Some(0), Some(1)]);

        let cost2 = DMatrix::from_row_slice(2, 2, &[99.0, 0.5, 99.0, 0.5]);
        let a2 = auction_assign(&cost2, 100);
        let g2 = filter_by_gate(&cost2, a2, 1.0);
        // Sólo uno está dentro de la puerta
        let in_gate = g2.iter().filter(|x| x.is_some()).count();
        assert_eq!(in_gate, 1);
    }

    #[test]
    fn gate_too_narrow_no_associations() {
        let cost = DMatrix::from_row_slice(2, 2, &[5.0, 10.0, 10.0, 5.0]);
        let a = auction_assign(&cost, 100);
        let g = filter_by_gate(&cost, a, 3.0);
        let assignments: Vec<_> = g.iter().filter(|x| x.is_some()).collect();
        assert!(
            assignments.is_empty(),
            "gate 3 no deberia asociar con mahal >= 5"
        );
    }

    #[test]
    fn auction_handles_two_close_targets() {
        let cost = DMatrix::from_row_slice(
            2,
            2,
            &[
                1.1, 1.2, //
                1.2, 1.1, //
            ],
        );
        let a = auction_assign(&cost, 1_000);
        assert_eq!(a, vec![Some(0), Some(1)]);
        assert_ne!(a[0], a[1], "dos targets cercanos no deben compartir medida");
    }
}
