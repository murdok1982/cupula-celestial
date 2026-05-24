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

RUN cargo build --release -p track-fusion || true

COPY services/track-fusion/src services/track-fusion/src
RUN touch services/track-fusion/src/main.rs && \
    cargo build --release -p track-fusion

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 libsasl2-2 libzstd1 \
    && rm -rf /var/lib/apt/lists/*

# H-ALT-006: usuario sin privilegios
RUN useradd -r -u 10001 -m -d /home/cupula cupula \
    && mkdir -p /app \
    && chown -R cupula:cupula /app

WORKDIR /app
COPY --from=builder /work/target/release/track-fusion /usr/local/bin/track-fusion
RUN chown cupula:cupula /usr/local/bin/track-fusion && chmod 0755 /usr/local/bin/track-fusion

USER cupula
EXPOSE 9100
ENV RUST_LOG=info
ENTRYPOINT ["/usr/local/bin/track-fusion"]
