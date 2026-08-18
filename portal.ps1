# ==============================================================================
# WCAH OMS Documentation Portal Runner (PowerShell / Windows)
# Builds all tenants (wcah, devlog, oms-v0, oms-v1, oms-v2), generates the root hub,
# and starts the local Pagenary preview server.
# ==============================================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  🏛️  West Coast Animal Hospital — OMS Documentation Library" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Building all tenants (wcah, devlog, oms-v0, oms-v1, oms-v2)..." -ForegroundColor Yellow
npx pagenary build --all

Write-Host ""
Write-Host "🌐 Updating root portal hub at dist/library/index.html..." -ForegroundColor Yellow
node scripts/build-portal.js

Write-Host ""
Write-Host "🚀 Starting Pagenary server at http://localhost:5173 ..." -ForegroundColor Green
Write-Host "-----------------------------------------------------------------"
Write-Host "  • Portal Hub:   http://localhost:5173/"
Write-Host "  • WCAH Anchor:  http://localhost:5173/wcah/"
Write-Host "  • Devlog:       http://localhost:5173/devlog/"
Write-Host "  • OMS v0:       http://localhost:5173/oms-v0/"
Write-Host "  • OMS v1:       http://localhost:5173/oms-v1/"
Write-Host "  • OMS v2:       http://localhost:5173/oms-v2/"
Write-Host "-----------------------------------------------------------------"
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

npx pagenary serve
