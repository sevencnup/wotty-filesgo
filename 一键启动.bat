@echo off
setlocal
set "PROJECT_DIR=%~dp0"

where cargo >nul 2>nul
if errorlevel 1 (
    echo 未找到 Rust Cargo，请安装 Rust 工具链并重试。
    pause
    exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
    echo 未找到 pnpm，请安装 pnpm 或将其加入 PATH 后重试。
    pause
    exit /b 1
)

powershell -NoProfile -Command "$ports = 3203,8080; $busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $ports }; if ($busy) { $busy | ForEach-Object { Write-Host ('端口 {0} 已被 PID {1} 占用。' -f $_.LocalPort, $_.OwningProcess) }; exit 1 }"
if errorlevel 1 (
    echo 请先释放 FilesGo 所需的 3203 或 8080 端口，再重新启动。
    pause
    exit /b 1
)

echo 正在启动 FilesGo API 和网页...
start "FilesGo API" /D "%PROJECT_DIR%server-rust" cmd /k "set PORT=3203&& cargo run"
start "FilesGo Web" /D "%PROJECT_DIR%frontend" cmd /k "pnpm dev"

powershell -NoProfile -Command "$url = 'http://127.0.0.1:8080'; $deadline = (Get-Date).AddMinutes(3); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing; if ($response.StatusCode -lt 500) { Start-Process $url; exit 0 } } catch {}; Start-Sleep -Seconds 1 }; Write-Error 'FilesGo 网页未能在 3 分钟内启动，请检查前端窗口中的错误。'; exit 1"
if errorlevel 1 (
    echo 请检查 FilesGo Web 窗口，确认 Next.js 已正常启动。
    pause
)
endlocal
