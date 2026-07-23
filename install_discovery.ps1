$ErrorActionPreference = "Stop"

python -c "import playwright" 2>$null
if ($LASTEXITCODE -ne 0) {
  python -m pip install playwright
}

@'
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    browser.close()

print("Playwright can launch the locally installed Google Chrome.")
'@ | python -

Write-Host "Maztozi discovery is ready. No Playwright browser download was used." -ForegroundColor Green
