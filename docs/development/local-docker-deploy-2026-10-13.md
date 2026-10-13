# FilesGO 本地 Docker 部署开发文档（2026-10-13）

## 目标

在本机使用仓库现有 Dockerfile 构建 FilesGO，并通过 Docker Compose 以 `wotty-filesgo` 容器运行，服务端口映射为 `3003:3003`，上传文件和 SQLite 数据库持久化到项目目录的 `data/` 下。

## 执行步骤

1. 核对 Dockerfile、Compose 配置、服务端口及现有同名容器，避免误占用或覆盖无关服务。
2. 将 Compose 的配置文件挂载源修正为仓库实际存在的 `server-rust/config.yaml`。
3. 创建 `data/uploads/` 和空的 `data/wotty-filesgo.db`，避免 Docker 将不存在的文件绑定源自动创建成目录。
4. 使用 Compose 构建镜像并启动容器，保留 `restart: unless-stopped` 和数据挂载。
5. 检查容器状态、启动日志、端口监听和首页 HTTP 响应；失败时停止继续部署并保留错误信息。

## 验收标准

- `wotty-filesgo` 容器处于运行状态。
- `http://127.0.0.1:3003/` 返回 FilesGO 前端页面。
- 日志无配置、数据库或静态前端加载错误。
- `data/uploads/` 与 `data/wotty-filesgo.db` 存在并作为容器持久化挂载使用。
