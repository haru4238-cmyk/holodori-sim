# HOLODORI SIM｜ホロドリ編成シミュレーター

ホロライブドリームス（ホロドリ）非公式の **編成シミュレーター** / カード所持管理サイトです。  
自動編成・スキルシナジー概算・ボード任意登録・楽曲向け編成・PWA に対応しています。

## セキュリティ（公開しても安心な設計）

- 所持・編成データは **各ユーザーのブラウザ内（localStorage）だけ**（サーバへ送らない）
- Content-Security-Policy で外部スクリプト禁止
- JSON/CSV 取込は形式チェック＋サイズ上限
- クリックジャッキング対策ヘッダ（`netlify.toml` / `vercel.json` 済み）
- 公式カード絵は同梱しない／他サイト画像の転載表示もしない

> バックアップJSONには所持情報が入ります。SNSや公開リポジトリに上げないでください。

## GitHub で公開する（おすすめ）

### はじめての人向け（画面操作）

1. ブラウザで [https://github.com/new](https://github.com/new) を開く  
2. Repository name に `holodori-sim` など好きな名前を入れる  
3. **Public** を選ぶ（GitHub Pages の無料公開用）  
4. 「Create repository」を押す（READMEは作らなくてOK）  
5. 出た画面の **「…or push an existing repository」** のコマンドを使う  

このPCでは、だいたい次です（`あなたのユーザー名` を置き換え）：

```powershell
cd C:\Users\haru4_hmsqhvf\holodori-sim
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/holodori-sim.git
git push -u origin main
```

6. GitHub のリポジトリページ → **Settings** → 左の **Pages**  
7. Build and deployment → Source を **Deploy from a branch**  
8. Branch を `main` / フォルダ `/ (root)` → **Save**  
9. 1〜2分待つと、上にURLが出ます（例: `https://あなたのユーザー名.github.io/holodori-sim/`）

### すでに GitHub CLI（`gh`）がある場合

```powershell
cd C:\Users\haru4_hmsqhvf\holodori-sim
gh auth login
gh repo create holodori-sim --public --source=. --remote=origin --push
```

そのあと同じように **Settings → Pages → main / root** を有効化。

## 自分のPCで試す

- `index.html` をダブルクリックでも動きます（`js/data.js` 埋め込み）
- 表示が古いときは **Ctrl+F5**
- または:

```powershell
cd C:\Users\haru4_hmsqhvf\holodori-sim
python -m http.server 8080
```

ブラウザで `http://localhost:8080`

## できること

- カード検索・所持登録（完凸 / 特訓 / レベル）
- 手動編成・**スキルシナジー込み自動編成**・複数候補・比較
- 楽曲向け自動編成（サンプル曲）
- ホロメンボード（任意・みんな登録／共有JSON）
- CSV一括取込 / JSONバックアップ
- PWA（ホーム画面追加）

## 権利表記

非公式ファンツールです。公式非公認。  
© COVER / © QualiArts, Inc. の権利は各権利者に帰属します。
