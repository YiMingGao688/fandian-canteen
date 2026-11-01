# 本地服务只使用工作区 .local 中的配置和独立数据库，默认仅监听本机地址。
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & python -X utf8 scripts/local_runtime.py
    if ($LASTEXITCODE -ne 0) { throw '启动失败，请查看 .local 目录中的对应日志。' }
} finally { Pop-Location }
