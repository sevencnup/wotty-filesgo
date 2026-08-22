# 上传文件服务端落盘加密（AES-256-GCM）

> 日期：2026-08-22 ｜ 决策：用户选定「服务端落盘加密（透明）」模型

## 目标

上传文件落盘前由 Rust 服务端加密，下载时流式解密。前端、取件码流程、数据库结构**完全不变**，对用户透明。
保护场景：磁盘被窃、备份泄露、绕过服务直接拷贝 `uploads/*.file`。

沿用 wotty-File protection 项目的加密思路（AES-256-GCM + 每文件 DEK + 主密钥信封加密），但不引入前端加密，密钥只存在服务端。

## 设计

### 密钥层级

```
FILESGO_MASTER_KEY（env，32B十六进制，可选）
        │ 无则自动生成并持久化到 uploads/master.key（0600）
        ▼
        │ 信封加密每文件 DEK
        ▼
每文件 DEK(32B 随机) + base_nonce(12B 随机)
        │ AES-256-GCM，nonce = base_nonce 前 4 字节覆盖为分片序号 i.u32_BE
        ▼
密文分片（= 上传会话的每个 chunk，等长加密，尾部 NAT tag 16B）
```

### 磁盘文件格式（`uploads/{uuid}.file`）

| 偏移 | 长度 | 字段 |
|------|------|------|
| 0 | 4 | magic `FGO1` |
| 4 | 4 | segment_size（u32 BE，= 会话 chunk_size） |
| 8 | 8 | total_size（u64 BE，明文大小） |
| 16 | 12 | base_nonce |
| 28 | 12 | wrap_nonce（包裹 DEK 用的随机 nonce） |
| 40 | 48 | wrapped_dek（AES-GCM(DEK, 主密钥, wrap_nonce)=32ct+16tag） |
| 88 | ... | 分片密文流（每个分片 = 明文分片 + 16B GCM tag） |

头固定 88 字节，自包含，无需改 DB schema。

### 兼容旧文件

旧文件（本改造前上传的明文）无 `FGO1` 头。下载时先读前 88 字节：
- 前 4 字节 == `FGO1` 且解析成功 → 流式解密；
- 否则 → 走原 `NamedFile` 路径（明文直传），老文件正常下载。

## 改动清单

1. `server-rust/Cargo.toml`：追加 `aes-gcm = "0.10"`。
2. `server-rust/src/crypto.rs`：新增主密钥加载/持久化 + 文件头编解码 + 分片加解密 + DEK 包裹/解包，附 AES-GCM 往返单测。
3. `server-rust/src/uploads.rs`：`complete_upload` 改为边合并边加密，只落密文，不产生明文临时文件。
4. `server-rust/src/handlers.rs`：`download_file` 改为流式解密响应（mpsc + ReceiverStream），带明文 Content-Length；旧明文文件回退 NamedFile。
5. `server-rust/src/main.rs`：启动时 `crypto::ensure_master_key()`。

## 代价 / 取舍

- 下载不再支持 HTTP Range（原 NamedFile 支持断点续传）；前端用 `window.location.href` 直下，不受影响。
- 加密/解密为同步 CPU 操作，块大小 ≤32MB，单块耗时毫秒级，worker 阻塞可接受。
- 主密钥未配置 env 时持久化在本地，磁盘+数据同机时管理员仍可解密（用户已接受"服务端可解密"模型）。

## 后续验证

- `cargo test`：crypto 往返、多分片边界、旧明文识别等 9 项单测全部通过 ✅
- `cargo build`：编译通过（含未启用警告的清理）✅
- 手动 E2E（临时端口实跑）：3.5MB @ 1MB 分片（3 整片 + 半片）上传 → 落盘文件以 `FGO1` 开头、非明文、尺寸 = 88 头 + 各片(seg+16) → 取件码下载逐字节一致 ✅