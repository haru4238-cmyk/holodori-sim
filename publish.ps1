# ASCII-only (avoid PowerShell encoding parse errors)
# Run in Cursor terminal AFTER creating empty repo on GitHub:
#   https://github.com/new  name=holodori-sim  Public  no README
#
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\haru4_hmsqhvf\holodori-sim"

Write-Host "[1] Check GitHub HTTPS..."
try {
    $null = Invoke-WebRequest -Uri "https://github.com" -UseBasicParsing -TimeoutSec 20
    Write-Host "OK"
} catch {
    Write-Host "FAIL: cannot reach GitHub from this terminal."
    Write-Host "Fix: reboot PC, then retry. Browser OK does not mean git works."
    Write-Host $_.Exception.Message
    exit 1
}

git branch -M main
$remote = "https://github.com/haru4238-cmyk/holodori-sim.git"
$existing = @(git remote 2>$null)
if ($existing -contains "origin") {
    git remote set-url origin $remote
} else {
    git remote add origin $remote
}

Write-Host "[2] git push -u origin main"
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "PUSH FAILED. Copy the error text and send it."
    exit $LASTEXITCODE
}

Write-Host "SUCCESS. Enable Pages:"
Write-Host "https://github.com/haru4238-cmyk/holodori-sim/settings/pages"
Write-Host "Source=Deploy from a branch / Branch=main / Folder=/(root) / Save"
Write-Host "Site URL: https://haru4238-cmyk.github.io/holodori-sim/"
Start-Process "https://github.com/haru4238-cmyk/holodori-sim/settings/pages"
