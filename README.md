# kitchen-inventory

キッチン食材の在庫を `inventory.json` で管理し、AI エージェントから Custom MCP 経由で安全に更新するためのリポジトリです。

MCP サーバーは Vercel の Serverless Function として動作し、GitHub Contents API でこのリポジトリの `inventory.json` だけを更新します。

## できること

- `inventory.json` を在庫データの正本として管理する
- Custom MCP の `write_inventory` ツールで在庫 JSON 全体を検証して書き込む
- `expected_updated_at` による簡易的な競合検出を行う
- 書き込み先を `inventory.json` に固定し、任意ファイルの更新を受け付けない

## MCP エンドポイント

Vercel 経由の MCP URL:

```text
https://kitchen-inventory-achel-b8.vercel.app/api/mcp
```

このエンドポイントは API キー認証が必須です。API キーの実値は README やリポジトリには記載せず、Vercel の環境変数やローカルの secret 管理にだけ保存してください。

推奨する認証方法:

```text
Authorization: Bearer <MCP_API_KEY>
```

または:

```text
X-API-Key: <MCP_API_KEY>
```

## Codex から使う

Codex の remote MCP として登録する場合は、API キーを環境変数で渡します。

```bash
export KITCHEN_INVENTORY_MCP_API_KEY="<MCP_API_KEY>"
codex mcp add kitchenInventory \
  --url https://kitchen-inventory-achel-b8.vercel.app/api/mcp \
  --bearer-token-env-var KITCHEN_INVENTORY_MCP_API_KEY
```

登録確認:

```bash
codex mcp list
```

`kitchenInventory` が `enabled` で表示されれば利用できます。

## MCP ツール

公開しているツールは `write_inventory` だけです。

入力:

- `inventory`: 更新後の `inventory.json` 全体
- `expected_updated_at`: 読み取り時点の `updated_at`。指定すると競合検出に使う
- `commit_message`: GitHub に作成するコミットメッセージ

読み取り用の MCP ツールはありません。読み取りは GitHub コネクタ、GitHub UI、またはリポジトリ上の `inventory.json` を使い、書き込みだけ MCP で行います。

## Vercel 環境変数

Vercel の Production と Preview に次を設定します。

```text
MCP_API_KEY=<long random API key>
GITHUB_TOKEN=<fine-grained personal access token>
GITHUB_OWNER=achel-b8
GITHUB_REPO=kitchen-inventory
GITHUB_BRANCH=main
```

`MCP_API_KEY` と `GITHUB_TOKEN` は secret として扱い、ログ、README、コミットには含めません。

GitHub token は Fine-grained personal access token を使い、対象 repository を `achel-b8/kitchen-inventory` のみに限定し、Repository permissions は `Contents: Read and write` のみにします。

## ローカル検証

```bash
npm install
npm run typecheck
npm test
```

在庫 JSON のスキーマだけ確認する場合:

```bash
npm run validate:inventory
```

## 関連ドキュメント

- `docs/README.md`: ドキュメント全体の案内
- `docs/specification.md`: 現在の実装リファレンス
- `docs/usage.md`: 在庫更新時の運用ガイド
- `setup.md`: Vercel と Custom MCP の詳細なセットアップ手順
