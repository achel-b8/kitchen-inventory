# 実装リファレンス

この文書は、現在の `kitchen-inventory` リポジトリの実装内容を説明する。

このリポジトリは、キッチン在庫の正本である `inventory.json` と、そのファイルだけを GitHub Contents API で更新する MCP サーバーを持つ。読み取り用 MCP ツール、Web UI、DB、在庫管理エージェント本体は含まない。

## 構成

```text
.
├── api/
│   └── mcp.ts
├── lib/
│   ├── github.ts
│   └── inventory-schema.ts
├── docs/
│   ├── README.md
│   ├── specification.md
│   └── usage.md
├── inventory.json
├── package.json
├── setup.md
├── tsconfig.json
└── vercel.json
```

主要な役割:

- `inventory.json`: 在庫データの正本。
- `lib/inventory-schema.ts`: 在庫 JSON の Zod schema、検証関数、日本時間 timestamp 生成。
- `lib/github.ts`: GitHub Contents API で `inventory.json` を取得、検証、更新する処理。
- `api/mcp.ts`: Vercel Serverless Function として動く Streamable HTTP MCP エンドポイント。
- `setup.md`: Vercel、GitHub token、ChatGPT Developer mode の接続手順。

## 実行環境

`package.json` は Node.js `24.x` を指定している。主な依存関係は次の通り。

- `@modelcontextprotocol/sdk`: MCP server と Streamable HTTP transport。
- `zod`: 入力と在庫 JSON の schema validation。
- `@vercel/node`: Vercel API Route 型。
- `typescript`, `vitest`: 型検査とテスト。

利用できる npm scripts:

```bash
npm run typecheck
npm test
npm run validate:inventory
```

## 在庫 JSON

在庫ファイルはリポジトリ直下の `inventory.json` に固定されている。現在のファイルは実在庫データを含む運用中の JSON であり、空の初期テンプレートではない。

基本構造:

```json
{
  "schema_version": 1,
  "updated_at": "2026-04-27T00:20:57+09:00",
  "inventory": {
    "生鮮": [],
    "調味料": [],
    "乾物": [],
    "冷凍庫": []
  }
}
```

`inventory` 直下の分類は次の4つに固定されている。

- `生鮮`
- `調味料`
- `乾物`
- `冷凍庫`

商品レコード:

```json
{
  "商品名": "和牛切り落とし",
  "追加日": "2026-04-26",
  "数": 80,
  "単位": "g"
}
```

検証ルール:

- `schema_version` は `1`。
- `updated_at` は日本時間の ISO 8601 文字列。例: `2026-04-27T00:20:57+09:00`。
- `商品名` は必須の非空文字列。
- `追加日` は実在する日付の `YYYY-MM-DD`。
- `数` は任意の 0 以上の有限数値。
- `単位` は任意の非空文字列。
- `単位` がある場合は `数` も必須。
- 分類キーは固定4分類のみ。欠落や追加キーは拒否される。
- 同一分類内で `商品名`、`追加日`、`単位` が同じレコードの重複は拒否される。

## MCP エンドポイント

Vercel 上のエンドポイント:

```text
https://<vercel-project>.vercel.app/api/mcp
```

実装は `StreamableHTTPServerTransport` を使う。受け付ける HTTP method は `POST` と CORS preflight の `OPTIONS`。それ以外は JSON-RPC error を返す。

MCP サーバー名:

```text
kitchen-inventory
```

公開ツールは `write_inventory` のみ。`read_inventory`、`search_inventory`、`list_inventory`、`get_item` は登録していない。読み取りは GitHub コネクタや GitHub UI に委ね、MCP は書き込みだけを担当する。

## 認証

`/api/mcp` は `MCP_API_KEY` による認証が必須。次のいずれかで API key を渡せる。

```text
Authorization: Bearer <MCP_API_KEY>
X-API-Key: <MCP_API_KEY>
https://<vercel-project>.vercel.app/api/mcp?api_key=<MCP_API_KEY>
```

`MCP_API_KEY` が未設定の場合は configuration error、API key がないか一致しない場合は unauthorized を返す。比較には hash 化した値の `timingSafeEqual` を使う。

## `write_inventory`

`write_inventory` は、更新後の `inventory.json` 全体を受け取り、検証後に GitHub 上の `inventory.json` をコミットする。

入力:

```json
{
  "inventory": {
    "schema_version": 1,
    "updated_at": "2026-04-27T00:20:57+09:00",
    "inventory": {
      "生鮮": [],
      "調味料": [],
      "乾物": [],
      "冷凍庫": []
    }
  },
  "expected_updated_at": "2026-04-27T00:20:57+09:00",
  "commit_message": "在庫を更新"
}
```

入力項目:

- `inventory`: 更新後の `inventory.json` 全体。必須。
- `expected_updated_at`: 読み取り時点の `updated_at`。任意。指定時は競合検出に使う。
- `commit_message`: 任意。未指定または空文字の場合は `Update inventory`。

処理順:

1. `inventory`、`expected_updated_at`、`commit_message` を検証する。
2. スキーマ違反があれば GitHub API へ進まず `schema_error` を返す。
3. `GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` を環境変数から読む。
4. GitHub Contents API で現在の `inventory.json` と file SHA を取得する。
5. 現在の `inventory.json` も schema validation に通す。
6. `expected_updated_at` が指定されていれば現在値と比較する。
7. 不一致なら更新せず `conflict` を返す。
8. `updated_at` をサーバー側の現在時刻、JST ISO 8601 形式に差し替える。
9. 取得済み SHA を指定して `inventory.json` を GitHub Contents API で更新する。
10. 成功時は commit SHA、GitHub URL、更新後 timestamp を返す。

成功時の tool result:

```json
{
  "ok": true,
  "commit_sha": "xxxxxxxx",
  "content_url": "https://github.com/achel-b8/kitchen-inventory/blob/main/inventory.json",
  "updated_at": "2026-04-27T00:30:00+09:00"
}
```

失敗時の tool result:

```json
{
  "ok": false,
  "error": "conflict",
  "message": "inventory.json was updated after expected_updated_at"
}
```

`write_inventory` の戻り値は MCP content の `text` として JSON 文字列で返る。

## GitHub 更新

更新対象はコード上で `inventory.json` に固定されている。クライアントから任意 path を指定する入力はない。

必要な環境変数:

```text
GITHUB_TOKEN=<fine-grained personal access token>
GITHUB_OWNER=achel-b8
GITHUB_REPO=kitchen-inventory
GITHUB_BRANCH=main
```

GitHub token は fine-grained personal access token を使い、対象 repository を `achel-b8/kitchen-inventory` のみに限定し、Repository permissions は `Contents: Read and write` のみにする。

## エラー

Tool result のエラー:

- `schema_error`: 入力または在庫 JSON が schema に合わない。
- `configuration_error`: GitHub 更新に必要な環境変数が不足している。
- `conflict`: `expected_updated_at` と現在の `updated_at` が一致しない。
- `github_error`: GitHub API の取得または更新で失敗した。
- `internal_error`: 予期しない更新エラー。

HTTP endpoint の認証・method エラーは JSON-RPC error で返る。

- API key 不一致: HTTP 401、`data.error` は `unauthorized`。
- `MCP_API_KEY` 未設定: HTTP 500、`data.error` は `configuration_error`。
- `POST` / `OPTIONS` 以外: HTTP 405。

Secret 値や request header はエラーメッセージに含めない。

## セキュリティ

- MCP endpoint は API key 認証を必須にしている。
- GitHub token は実行時環境変数からだけ読む。
- `inventory.json` 以外のファイルを更新する入力を受け付けない。
- Tool description と tool result には secret を含めない。
- `.env` と `.env.*` は `.gitignore` 対象。`.env.example` だけをリポジトリに置く。
- URL query で API key を渡す場合は、共有範囲とログ露出を最小にする。
