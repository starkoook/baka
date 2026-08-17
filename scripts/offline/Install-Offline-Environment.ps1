$ErrorActionPreference = "Stop"

$bundleRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $bundleRoot "trainer-core"
$versionFile = Join-Path $source "version.json"
if (-not (Test-Path -LiteralPath (Join-Path $source "gui.py")) -or -not (Test-Path -LiteralPath $versionFile)) {
    throw "离线训练器核心不完整，请重新解压离线包。"
}
if (-not (Test-Path -LiteralPath (Join-Path $source "env\python\.deps_installed"))) {
    throw "离线 NVIDIA standard 环境缺少完成标记，请重新下载并校验离线包。"
}

$version = (Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json).version
$dataRoot = Join-Path $env:APPDATA "baka-tools"
$versionsRoot = Join-Path $dataRoot "trainer\versions"
$target = Join-Path $versionsRoot $version
$activePath = Join-Path $dataRoot "trainer\active.json"

New-Item -ItemType Directory -Path $versionsRoot -Force | Out-Null
if (Test-Path -LiteralPath $target) {
    $backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item -LiteralPath $target -Destination $backup
    Write-Host "已有同版本训练器已备份到：$backup" -ForegroundColor Yellow
}

Copy-Item -LiteralPath $source -Destination $target -Recurse
$active = @{
    activeVersion = $version
    previousVersion = $null
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    source = "nvidia-standard-offline"
} | ConvertTo-Json
$temporary = "$activePath.tmp"
Set-Content -LiteralPath $temporary -Value $active -Encoding UTF8
Move-Item -LiteralPath $temporary -Destination $activePath -Force

Write-Host "离线训练环境安装完成：$target" -ForegroundColor Green
Write-Host "现在可以启动 Baka TOOLS，进入训练器。" -ForegroundColor Green
