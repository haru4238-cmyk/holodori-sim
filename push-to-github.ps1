# HOLODORI SIM を GitHub に上げるための補助スクリプト（Windows / PowerShell）
# 使い方:
#   1. https://github.com/new で空のリポジトリを作る（Public、READMEなし）
#   2. 下の $GitHubUser と $RepoName を自分用に書き換える
#   3. このファイルを右クリック → PowerShell で実行
#      または: powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1

$ErrorActionPreference = "Stop"

# ===== ここだけ書き換える =====
$GitHubUser = "あなたのユーザー名"   # 例: haru4
$RepoName   = "holodori-sim"
# ============================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if ($GitHubUser -eq "あなたのユーザー名") {
    Write-Host "エラー: スクリプト内の `$GitHubUser を GitHub のユーザー名に書き換えてください。" -ForegroundColor Red
    exit 1
}

# git があるか確認
try {
    git --version | Out-Null
} catch {
    Write-Host "エラー: Git が入っていません。https://git-scm.com/download/win から入れてください。" -ForegroundColor Red
    exit 1
}

# ブランチ名を main にそろえる
git branch -M main 2>$null

$remoteUrl = "https://github.com/$GitHubUser/$RepoName.git"
$existing = git remote 2>$null
if ($existing -match "(?m)^origin$") {
    git remote set-url origin $remoteUrl
    Write-Host "origin を更新しました: $remoteUrl"
} else {
    git remote add origin $remoteUrl
    Write-Host "origin を追加しました: $remoteUrl"
}

Write-Host "push を開始します（ログイン画面が出たら GitHub にサインインしてください）..."
git push -u origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "push に失敗しました。" -ForegroundColor Red
    Write-Host "よくある原因:"
    Write-Host "  - ネットが切れている / 会社・学校の制限"
    Write-Host "  - リポジトリ名やユーザー名の打ち間違い"
    Write-Host "  - GitHub にログインできていない"
    Write-Host "エラー全文をコピーして相談してください。"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "成功しました。" -ForegroundColor Green
Write-Host "次の手順:"
Write-Host "  1. https://github.com/$GitHubUser/$RepoName/settings/pages を開く"
Write-Host "  2. Source = Deploy from a branch"
Write-Host "  3. Branch = main / folder = / (root) → Save"
Write-Host "  4. 少し待つとサイトURLが表示されます"
Write-Host "     例: https://$GitHubUser.github.io/$RepoName/"
