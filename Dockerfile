FROM rust:1.75 as rustbuilder
WORKDIR /app/worker
COPY worker-rust/ .
RUN cargo build --release

FROM golang:1.22-bookworm as gobuilder
WORKDIR /app/server
COPY server-go/go.mod server-go/go.sum ./
RUN go env -w GOPROXY=https://goproxy.cn,direct
RUN apt-get update && apt-get install -y build-essential pkg-config libsqlite3-dev && rm -rf /var/lib/apt/lists/*
COPY server-go/ .
RUN go build -o cloud-server main.go

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=gobuilder /app/server/cloud-server /app/cloud-server
COPY --from=gobuilder /app/server/dist /app/dist
COPY --from=rustbuilder /app/worker/target/release/worker-rust /app/worker-rust
ENV GIN_MODE=release
EXPOSE 8080 8081
CMD bash -c "./worker-rust & ./cloud-server"
