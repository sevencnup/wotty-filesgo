# ---- Stage 1: build Next.js frontend (static export) ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# next build outputs static export to ./dist (see next.config.js output: 'export')
RUN npm run build

# ---- Stage 2: build Rust server ----
FROM rust:1.93 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential pkg-config libsqlite3-dev && rm -rf /var/lib/apt/lists/*
COPY server-rust/Cargo.toml server-rust/Cargo.lock ./
COPY server-rust/src ./src
COPY server-rust/config.yaml ./
# Copy the static frontend build into the server's static dir
COPY --from=frontend /app/frontend/dist ./dist
RUN cargo build --release --locked

# ---- Stage 3: runtime ----
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/filesgo-server /app/filesgo-server
COPY --from=builder /app/config.yaml ./
COPY --from=builder /app/dist ./dist
EXPOSE 3003
CMD ["./filesgo-server"]
