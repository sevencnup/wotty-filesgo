#!/bin/bash

# FilesGo Linux 部署脚本
APP_NAME="filesgo-server-linux"
PORT=8080

echo "=========================================="
echo "      FilesGo 服务更新/重启脚本 (Linux)"
echo "=========================================="

# 1. 查找并清理旧进程
PID=$(lsof -t -i:$PORT)
if [ ! -z "$PID" ]; then
    echo "[INFO] 正在清理占用端口 $PORT 的旧进程 (PID: $PID)..."
    kill -9 $PID
fi

# 也可以通过进程名清理
PIDS_BY_NAME=$(pgrep -f $APP_NAME)
if [ ! -z "$PIDS_BY_NAME" ]; then
    echo "[INFO] 正在清理进程 $APP_NAME..."
    kill -9 $PIDS_BY_NAME
fi

# 2. 赋予执行权限
chmod +x ./$APP_NAME

# 3. 启动服务 (后台运行)
echo "[INFO] 正在启动 $APP_NAME..."
nohup ./$APP_NAME > server.log 2>&1 &

# 4. 检查启动状态
sleep 2
if ps -p $! > /dev/null; then
    echo "[SUCCESS] 服务已在后台启动！"
    echo "[INFO] 监听端口: $PORT"
    echo "[INFO] 日志文件: server.log"
else
    echo "[ERROR] 服务启动失败，请检查 server.log"
    cat server.log
fi

echo "------------------------------------------"
