# FilesGO Docker CI 构建修复

## 目标

修复 GitHub Actions 打包失败（`failed to calculate checksum of ref ...: "/server-rust/dist": not found`），让 ghcr.io 镜像能自动构建推送。

## 现状问题

1. [Dockerfile](Dockerfile) 通过 `COPY server-rust/dist ./dist` 把前端构建产物拷进镜像。
2. `server-rust/dist` 是本地 `npm run build:prep` 从 `frontend/dist` 复制来的产物，根 `.gitignore` 里的裸 `dist` 规则同时忽略了它，因此从未提交到 git。
3. 服务器部署走 [deploy.py](deploy.py)，通过 tar 上传本地已存在的 `server-rust/dist`，所以服务器上 Docker 构建一直正常。
4. GitHub Actions 只 checkout git 内容，没有 `server-rust/dist`，于是 COPY 失败 → 镜像构建失败。
5. 换成镜像内 `npm ci` 后，又暴露 `frontend/package-lock.json` 里 503 处 `resolved` 指向 `registry.npmmirror.com`：npm ci 以 lockfile 里的 resolved URL 为准，GitHub 构建机取不到该镜像（404），同样构建失败。

## 方案

把“拷贝本地未提交产物”改成“在镜像内从源码构建前端”，并把 lockfile 抽离本地镜像，使 CI 自包含、可复现：

1. 新增前端构建 Stage：`node:20-slim` + `npm ci` + `next build`（静态导出到 `frontend/dist`）。
2. 在 Rust 构建 Stage 里用 `COPY --from=frontend` 取 `frontend/dist` 作为服务端静态目录 `dist`。
3. 运行时镜像结构不变（binary + config.yaml + dist），保持服务端读写 `dist/index.html`、`dist` 的契约。
4. 重写 `frontend/package-lock.json` 的 `resolved` 主机为官方 `registry.npmjs.org`（仅改 host，URL 结构不变）；本地 `.npmrc` 仍指向 npmmirror，不影响国内开发体验。

## 实施

- 重写根 [Dockerfile](Dockerfile) 为三阶段构建（frontend → rust builder → runtime）。
- 批量替换 `frontend/package-lock.json` 中 `registry.npmmirror.com` → `registry.npmjs.org`。

## 验收标准

- GitHub Actions push 到 main 后能拉取源码成功构建并推送 ghcr.io 镜像。
- 服务器 `docker-compose build`（deploy.py 流程）仍然可用，前/静态目录结构不变。
- 无任何构建产物（dist、node_modules、target）需要提交到 git。
- 本地 npm 安装仍走 npmmirror 镜像，开发体验不变。
