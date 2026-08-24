# Agrega las canciones nuevas en music/ a la pagina: regenera data/music.json,
# hace git add/commit/push desde la raiz del repo.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "Regenerando data/music.json..."
node "scripts/generate-music-list.mjs"

Write-Host "Agregando archivos nuevos/modificados..."
git add "music/" "data/music.json"

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "No hay canciones nuevas que agregar."
    exit 0
}

Write-Host "Archivos a commitear:"
$staged | ForEach-Object { Write-Host "  $_" }

git commit -m "feat: nuevas canciones"

Write-Host "Haciendo push..."
git push

Write-Host "Listo."
