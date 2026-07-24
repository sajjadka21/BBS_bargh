[CmdletBinding()]
param(
    [string]$Repository = "sajjadka21/BBS_bargh",
    [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is not installed. Install it with: winget install GitHub.cli"
}

gh auth status
if ($LASTEXITCODE -ne 0) {
    throw "Run 'gh auth login' first."
}

& $PythonExe -m pip install --disable-pip-version-check -r .\requirements-bargheman-bootstrap.txt
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }

& $PythonExe -m playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Playwright Chromium installation failed." }

& $PythonExe .\bargheman_bootstrap.py --repository $Repository
if ($LASTEXITCODE -ne 0) { throw "Bargheman bootstrap failed." }

Write-Host ""
Write-Host "Bargheman GitHub secrets are ready." -ForegroundColor Green
Write-Host "Chrome can remain closed; scheduled fetches run on GitHub-hosted runners."
