# wotty FilesGO

一个可自托管的文件传输与设备聊天应用。你可以通过 6 位取件码分享文件，也可以配对自己的设备并实时发送消息和文件。

## 功能

- 浏览器上传、拖放文件并生成取件码和分享链接；一个文件对应一个取件码。
- 大文件采用分片上传，支持完整性校验、失败重试和中断后恢复上传。
- 按取件码查看文件信息并下载；文件会按配置自动过期清理。
- 配对设备后可实时发送文本消息和文件，查看消息送达、已读状态。
- 可配置站点访问密码、单 IP 每日上传次数、IP 白名单和上传大小限制。
- 取件码主流程使用 AES-256-GCM 加密文件后再落盘。
- 适配桌面和移动浏览器。

## Docker 部署

需要已安装 Docker Engine 和 Docker Compose。Linux 服务器上，在仓库根目录初始化持久化目录并启动：

```bash
mkdir -p data/uploads
touch data/wotty-filesgo.db
docker compose up -d --build
```

打开 `http://服务器地址:3003` 使用取件码传输；设备聊天页为 `/device`。如通过域名或反向代理访问，请在 `docker-compose.yml` 的服务配置中把 `SERVER_ADDR` 设为外部访问的完整地址，这样生成的分享链接才会指向你的站点：

```yaml
environment:
  GIN_MODE: release
  SERVER_ADDR: "https://files.example.com"
```

将示例域名替换成自己的地址后，再执行 `docker compose up -d --build`。

Compose 将以下数据保存在仓库的 `data/` 目录：

- `data/uploads/`：加密文件、上传会话和服务端主密钥。
- `data/wotty-filesgo.db`：设备、配对、消息和文件记录数据库。

不要删除或覆盖这些数据目录来“重置”容器；特别是 `uploads/master.key` 或外部配置的主密钥一旦丢失，已有加密文件将无法解密。备份时应一并保护文件数据、数据库和密钥。

## 部署前配置

主要配置位于 [`server-rust/config.yaml`](server-rust/config.yaml)，Docker 中以只读方式挂载到容器。修改后重启服务生效。

| 配置 | 当前仓库默认值 | 说明 |
| --- | --- | --- |
| `security.site_password` | 空 | 站点访问密码；留空时关闭密码保护。公网部署前建议设置强密码。 |
| `security.max_login_attempts_per_minute` | `10` | 单个 IP 每分钟允许的站点密码尝试次数。 |
| `rate_limit.max_uploads_per_day` | `20` | 单个 IP 每日上传次数；设为 `0` 表示不限制。 |
| `rate_limit.allowed_ips` | `[]` | 不受每日上传次数限制的 IP 白名单。 |
| `rate_limit.trusted_proxy_ips` | `[]` | 仅对列入此项的反向代理信任 `X-Forwarded-For`。不要信任任意客户端传入的转发头。 |
| `upload.max_file_size_gb` | `10` | 单个文件大小上限。 |
| `upload.max_total_size_gb` | `20` | 前端一次选择的文件总大小上限。 |
| `upload.chunk_size_mb` | `8` | 默认分片大小，服务端允许 `1–32 MB`。 |

默认文件保留配置为：上传后初始保留 2 小时、首次下载后保留 2 小时，且上传后的最大生命周期为 2 小时。文件到期后由后台清理任务删除；调整 `retention` 下的三个字段可修改策略。

### 文件加密边界

取件码主流程的分片接口 `/api/uploads/...` 会先用 AES-256-GCM 加密再落盘。文件落盘加密是服务端静态数据保护，不是端到端加密：服务端持有或可读取主密钥，因此有权限管理服务器的操作者仍能解密文件。默认情况下主密钥自动生成并存放在 `data/uploads/master.key`；也可通过容器环境变量 `WOTTY_FILESGO_MASTER_KEY` 提供固定的 64 位十六进制密钥。密钥必须在容器重建和数据恢复后保持不变，切勿提交到 Git。

注意：设备聊天附件目前使用兼容接口 `POST /api/upload`，该旧接口会将文件明文写入 `uploads/`，不走上述分片加密流程。不要通过设备聊天发送需要服务端落盘加密保护的敏感文件。

生产环境建议再配置 HTTPS 反向代理，并设置 `SERVER_ADDR` 和非空站点密码。站点密码保护应用接口，但不替代 HTTPS；不要把未配置保护的实例直接暴露到不可信网络。

## 本地开发

需要 Rust/Cargo、Node.js 20+ 和 pnpm。前端 Next.js 开发服务器监听 `8080`，并将 `/api` 转发到本机 `3203` 端口的 Rust 服务。

推荐在 Windows 上使用仓库自带的一键启动脚本：依赖准备完成后运行 `一键启动.bat`。它会检查 Cargo 和 pnpm、确认 `3203` 与 `8080` 端口空闲，再分别打开后端和前端窗口。

手动启动时使用两个终端。先启动后端：

```powershell
cd server-rust
$env:PORT = "3203"
cargo run
```

再启动前端：

```powershell
cd frontend
pnpm dev
```

前端依赖应按共享 pnpm workspace 规范在 workspace 根目录管理；先将本仓库的 `frontend` 包加入 workspace 的 `packages`，然后从 workspace 根目录运行一次 `pnpm install`，不要在此仓库子目录单独安装依赖。Rust 后端测试可在 `server-rust/` 目录运行：

```bash
cargo test
```

## API 概览

后端默认监听 `3003`（本地开发脚本可用 `PORT` 改为 `3203`）。主要接口如下：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/config` | 获取站点公开配置和上传限制 |
| `POST` | `/api/upload` | 旧版直接上传接口，目前用于设备聊天附件 |
| `POST` | `/api/uploads` | 创建可恢复的分片上传会话 |
| `GET` / `DELETE` | `/api/uploads/{upload_id}` | 查询或取消上传会话 |
| `PUT` | `/api/uploads/{upload_id}/chunks/{index}` | 上传并校验一个分片 |
| `POST` | `/api/uploads/{upload_id}/complete` | 合并分片、加密文件并生成取件码 |
| `GET` | `/api/file/{code}` | 获取取件文件信息 |
| `GET` | `/api/download/{code}` | 下载文件 |
| `POST` | `/api/device/register` | 注册浏览器设备 |
| `POST` | `/api/pairing/request` | 申请设备配对 |
| `GET` | `/api/messages` | 获取设备消息 |
| `GET` | `/ws` | 实时消息 WebSocket |

启用站点密码后，除登录和登录状态接口外的 API 及 WebSocket 都需要有效的站点登录会话。

## 技术栈与文档

- 前端：Next.js 14、React、TypeScript，静态导出。
- 后端：Rust、Actix Web、SQLite。
- 取件码文件保护：AES-256-GCM 分片加密，独立文件密钥由服务端主密钥封装。设备聊天附件当前仍使用旧版未加密落盘接口，详见[文件加密边界](#文件加密边界)。

更多说明：

- [Docker 本地部署记录](docs/development/local-docker-deploy-2026-10-13.md)
- [大文件断点续传实现说明](docs/development/resumable-transfer-v2-2026-08-04.md)
- [文件落盘加密说明](docs/development/encryption-at-rest-2026-08-22.md)
- [功能变更记录](CHANGELOG.md)
- [版本记录](VERSION_RECORD.md)
