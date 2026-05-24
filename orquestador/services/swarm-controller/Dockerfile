FROM rust:1.81-slim AS builder
WORKDIR /work
RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev cmake build-essential libsasl2-dev libzstd-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
COPY services/sensor-ingest/Cargo.toml services/sensor-ingest/
COPY services/track-fusion/Cargo.toml services/track-fusion/
COPY services/swarm-controller/Cargo.toml services/swarm-controller/
COPY services/hmi-gateway/Cargo.toml services/hmi-gateway/
COPY services/audit-log/Cargo.toml services/audit-log/

RUN mkdir -p services/sensor-ingest/src services/track-fusion/src \
              services/swarm-controller/src services/hmi-gateway/src \
              services/audit-log/src && \
    echo "fn main() {}" | tee services/*/src/main.rs

RUN cargo build --release -p swarm-controller || true

COPY services/swarm-controller/src services/swarm-controller/src
RUN touch services/swarm-controller/src/main.rs && \
    cargo build --release -p swarm-controller

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 libsasl2-2 libzstd1 \
    && rm -rf /var/lib/apt/lists/*

# H-ALT-006: usuario sin privilegios
RUN useradd -r -u 10001 -m -d /home/cupula cupula \
    && mkdir -p /app /run/secrets \
    && chown -R cupula:cupula /app /run/secrets

WORKDIR /app
COPY --from=builder /work/target/release/swarm-controller /usr/local/bin/swarm-controller
RUN chown cupula:cupula /usr/local/bin/swarm-controller && chmod 0755 /usr/local/bin/swarm-controller

USER cupula
EXPOSE 9200
ENV RUST_LOG=info
ENTRYPOINT ["/usr/local/bin/swarm-controller"]
