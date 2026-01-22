@echo off
echo 正在启动 FilesGo 云传输系统...

start "FilesGo-Worker" /min .\worker-rust.exe
echo [1/2] Rust Worker 已在后台启动...

timeout /t 2 /nobreak > nul

echo [2/2] 正在启动 Go Server...
.\cloud-server.exe

pause