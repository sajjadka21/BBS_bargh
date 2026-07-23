$ErrorActionPreference = "Stop"
Set-Location "D:\project\BBS_bargh"
python -m pip install --upgrade playwright
python -m playwright install chromium
Write-Host "Maztozi automatic source discovery is ready." -ForegroundColor Green
