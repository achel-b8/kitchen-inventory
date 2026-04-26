# セットアップ手順

このリポジトリは、`inventory.json` を正本として持ち、Vercel 上の Custom MCP から GitHub Contents API でそのファイルだけを更新します。MCP が公開するツールは `write_inventory` のみです。

## 1. GitHub token を作成する

1. GitHub の Fine-grained personal access token を作成します。
2. 対象 repository を `achel-b8/kitchen-inventory` のみに限定します。
3. Repository permissions は `Contents: Read and write` のみにします。
4. token の値はリポジトリに保存せず、Vercel の環境変数にだけ設定します。

## 2. Vercel に import する

1. Vercel で GitHub repository を import します。
2. Framework Preset は `Other` または自動検出を使います。
3. Node.js は 24 以上を使います。このリポジトリは `package.json` の `engines.node` で `>=24` を指定しています。
4. Build Command は通常の自動検出で構いません。明示する場合は `npm run typecheck` を設定します。
5. Output Directory は不要です。

## 3. Vercel 環境変数を設定する

Production と Preview の両方に次を設定します。

```text
GITHUB_TOKEN=<fine-grained personal access token>
GITHUB_OWNER=achel-b8
GITHUB_REPO=kitchen-inventory
GITHUB_BRANCH=main
```

`GITHUB_TOKEN` は secret として扱い、ログ、ドキュメント、コミットに含めないでください。

## 4. ChatGPT Developer mode で接続する

1. ChatGPT の Developer mode を有効化します。
2. Apps / Connectors から Custom MCP / App を作成します。
3. MCP URL に次を設定します。

```text
https://<vercel-project>.vercel.app/api/mcp
```

4. tool list を更新し、`write_inventory` だけが表示されることを確認します。
5. 読み取りは GitHub コネクタで `inventory.json` を参照し、書き込みだけこの MCP を使います。

## 5. 書き込み時の運用

`write_inventory` には、更新後の `inventory.json` 全体を渡します。`expected_updated_at` には、GitHub コネクタで読み取った時点の `updated_at` を入れると、他の更新との競合を検出できます。

書き込み確認画面では次を確認してください。

- `inventory` 直下の分類が `生鮮`、`調味料`、`乾物`、`冷凍庫` の4つだけであること
- `商品名` と `追加日` が欠落していないこと
- `数` が負数になっていないこと
- `単位` を入れる場合は、対応する `数` も入っていること
- 意図しない商品削除がないこと
- `commit_message` が変更内容に合っていること

## 6. ローカル検証

```bash
npm install
npm run typecheck
npm test
```

secret が未設定の状態では、`write_inventory` は `configuration_error` を返します。これはローカル検証では正常です。

## トラブルシュート

### `configuration_error`

Vercel の `GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` を確認します。Production と Preview のどちらに設定したかも確認してください。

### `conflict`

`inventory.json` が、読み取り後に別の更新で変更されています。最新の `inventory.json` を読み直し、変更内容を再適用してから `write_inventory` を再実行します。

### `schema_error`

分類名、必須項目、日付形式、負数の `数`、`単位` だけの指定、同一分類内の重複レコードを確認します。

### `github_error`

GitHub token の repository scope と Contents read/write 権限を確認します。対象 branch が `main` であることも確認してください。
