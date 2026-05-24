//! Biblioteca pública del crate track-fusion (filtros Kalman/IMM, asociación,
//! M/N confirmation). Mantenida en lib.rs para que la corra cargo test
//! independientemente del binario.

pub mod fusion;
pub mod publisher;
pub mod tracker;
pub mod types;
