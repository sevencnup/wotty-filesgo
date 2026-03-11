FROM rust:1.75 as builder
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential pkg-config libsqlite3-dev && rm -rf /var/lib/apt/lists/*
COPY server-rust/Cargo.toml server-rust/Cargo.lock ./
COPY server-rust/src ./src
COPY server-rust/config.yaml ./
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/server-rust /app/filesgo-server
COPY --from=builder /app/config.yaml ./
EXPOSE 8080
ENV GIN_MODE=release
CMD ["./filesgo-server"]
