# Promueve un usuario a admin en la MISMA base que Render (Aiven).
#
# Antes de ejecutar, en PowerShell (sustituye con valores de Render → Environment):
#
#   $env:USE_SQLITE = "false"
#   Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
#   $env:MYSQL_SERVICE_URI = "mysql://avnadmin:...@mysql-xxxx.i.aivencloud.com:PUERTO/defaultdb?ssl-mode=REQUIRED"
#   $env:MYSQL_SSL_CA = "ca.pem"
#   # o: $env:MYSQL_SSL_CA_CONTENT = (Get-Content -Raw "ca.pem")
#
# Luego:
#   .\scripts\promote_admin_produccion.ps1 lizank176@gmail.com

param(
    [Parameter(Mandatory = $true)]
    [string]$Email
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $env:MYSQL_SERVICE_URI -and -not $env:MYSQL_HOST) {
    Write-Host "ERROR: Define MYSQL_SERVICE_URI (recomendado) o MYSQL_HOST+MYSQL_USER+MYSQL_PASSWORD." -ForegroundColor Red
    Write-Host "Copialos desde Render Dashboard -> Environment (no uses DATABASE_URL local)." -ForegroundColor Yellow
    exit 1
}

$env:USE_SQLITE = "false"
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:PYTHONPATH = $Root

if (-not $env:MYSQL_SSL_CA -and -not $env:MYSQL_SSL_CA_CONTENT) {
    foreach ($p in @("ca.pem", "infra\aiven\ca.pem")) {
        if (Test-Path $p) {
            $env:MYSQL_SSL_CA = (Resolve-Path $p).Path
            break
        }
    }
}

Write-Host "Probando conexion a Aiven..." -ForegroundColor Cyan
& "$Root\venv\Scripts\python.exe" "$Root\scripts\test_mysql_connection.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Promoviendo $Email ..." -ForegroundColor Cyan
& "$Root\venv\Scripts\python.exe" "$Root\scripts\set_user_admin.py" $Email
exit $LASTEXITCODE
