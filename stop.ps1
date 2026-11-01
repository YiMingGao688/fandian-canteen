# 只停止命令行核对属于本工作区的服务，不删除数据库文件。
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try { & python -X utf8 scripts/stop_local.py } finally { Pop-Location }
