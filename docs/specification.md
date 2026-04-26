# キッチン在庫管理リポジトリ 仕様書

## 目的

このリポジトリは、冷蔵庫を中心としたキッチン食材の在庫状態を `inventory.json` に永続化し、AI エージェントが Custom MCP 経由でその JSON を更新できるようにする。

このリポジトリでは在庫管理エージェント本体は実装しない。実装対象は次の2点に限定する。

- 在庫データの正本となる `inventory.json`
- `inventory.json` を GitHub 上で更新、コミットできる Vercel 向け Custom MCP

管理対象リポジトリは `https://github.com/achel-b8/kitchen-inventory` とする。

## スコープ

### 対象

- Vercel にそのまま読み込ませてデプロイできる最小構成の MCP サーバー
- GitHub API を使った `inventory.json` の更新コミット
- `inventory.json` のスキーマ定義と検証
- ルート直下の `setup.md` による Vercel / ChatGPT 側設定手順

### 対象外

- 在庫管理エージェント本体の実装
- ChatGPT の GitHub コネクタで代替できる `inventory.json` の検索、読み取り専用 MCP ツール
- Web UI
- DB や外部ストレージ
- 複数ユーザーの権限管理
- レシピ提案、賞味期限推定、通知機能

## 前提

- MCP サーバーは Vercel の Node.js Serverless Function として動作させる。
- ChatGPT 側では Developer mode の Custom MCP / Apps 設定から接続する。
- ChatGPT Developer mode は write tool を扱えるが、書き込みアクションは確認対象になる前提で運用する。
- JSON の読み取りは ChatGPT の GitHub コネクタなどを使う。MCP は読み取りツールを公開しない。
- MCP サーバー内部では GitHub の更新に必要な現在ファイル SHA を取得するが、それはツールとして外部公開しない。

参考:

- OpenAI: Building MCP servers for ChatGPT Apps and API integrations  
  https://platform.openai.com/docs/mcp
- OpenAI: ChatGPT Developer mode  
  https://platform.openai.com/docs/developer-mode
- OpenAI: MCP and Connectors  
  https://platform.openai.com/docs/guides/tools-remote-mcp

## 在庫 JSON 仕様

ファイルパスはリポジトリ直下の `inventory.json` とする。

### 基本構造

```json
{
  "schema_version": 1,
  "updated_at": "2026-04-26T22:00:00+09:00",
  "inventory": {
    "生鮮": [],
    "調味料": [],
    "乾物": [],
    "冷凍庫": []
  }
}
```

### 大分類

`inventory` 直下のキーは次の4つに固定する。

- `生鮮`
- `調味料`
- `乾物`
- `冷凍庫`

これ以外の分類キーは許可しない。

### 商品レコード

各分類は商品レコードの配列を持つ。

```json
{
  "商品名": "卵",
  "追加日": "2026-04-26",
  "数": 10,
  "単位": "個"
}
```

必須パラメーター:

- `商品名`: 空文字不可の文字列
- `追加日`: `YYYY-MM-DD` 形式の日付文字列

任意パラメーター:

- `数`: 0以上の数値。個数、重量、容量など、在庫管理したい量を数値で入れる。未設定の場合は数量不明または数量管理しない商品として扱う。
- `単位`: 空文字不可の文字列。例: `個`, `g`, `ml`, `袋`, `缶`。`単位` を指定する場合は `数` も指定する。

### レコード同一性

同一レコードは次の組み合わせで判定する。

- 大分類
- `商品名`
- `追加日`
- `単位`

同じ組み合わせのレコードは1件に統合する。追加入荷が同じ日に発生した場合は `数` を加算する。追加日または `単位` が異なる場合は別レコードとして残す。

### 数量の扱い

- `数` がある商品を消費した場合、同じ `単位` の消費数を差し引く。
- 差し引き後の `数` が 0 になったレコードは削除する。
- `数` がない商品を消費した場合、明示的な削除指示があるときだけ削除する。
- `数` は負数にしない。
- 重量、容量、袋、束などの単位は `単位` に文字列として保存する。

### 日付と時刻

- `追加日` は日本時間基準の `YYYY-MM-DD` とする。
- `updated_at` は日本時間の ISO 8601 文字列とする。
- MCP サーバーは書き込み時に `updated_at` をサーバー側で更新する。

## MCP 仕様

### 公開エンドポイント

Vercel デプロイ後の MCP エンドポイント:

```text
https://<vercel-project>.vercel.app/api/mcp
```

プロトコルは ChatGPT Developer mode がサポートする Streaming HTTP を第一候補とする。SSE は Vercel Serverless Function との相性を考慮し、MVP では採用しない。

### 公開ツール

MVP ではツールを1つだけ公開する。

#### `write_inventory`

`inventory.json` の全体内容を検証し、GitHub リポジトリにコミットする。

入力:

```json
{
  "inventory": {
    "schema_version": 1,
    "updated_at": "2026-04-26T22:00:00+09:00",
    "inventory": {
      "生鮮": [
        {
          "商品名": "卵",
          "追加日": "2026-04-26",
          "数": 10,
          "単位": "個"
        }
      ],
      "調味料": [],
      "乾物": [],
      "冷凍庫": []
    }
  },
  "expected_updated_at": "2026-04-26T21:30:00+09:00",
  "commit_message": "卵を在庫に追加"
}
```

入力項目:

- `inventory`: 更新後の `inventory.json` 全体
- `expected_updated_at`: 任意。エージェントが読み取った時点の `updated_at`
- `commit_message`: 任意。未指定時は `Update inventory` とする

処理:

1. 入力 JSON をスキーマ検証する。
2. GitHub API で現在の `inventory.json` を取得する。
3. `expected_updated_at` が指定されている場合、現在の `updated_at` と一致するか検証する。
4. サーバー側で `updated_at` を現在時刻に更新する。
5. GitHub Contents API で `inventory.json` を更新コミットする。
6. コミット SHA とファイル URL を返す。

出力:

```json
{
  "ok": true,
  "commit_sha": "xxxxxxxx",
  "content_url": "https://github.com/achel-b8/kitchen-inventory/blob/main/inventory.json"
}
```

競合時の出力:

```json
{
  "ok": false,
  "error": "conflict",
  "message": "inventory.json was updated after expected_updated_at"
}
```

### 公開しないツール

次のツールは MVP では実装しない。

- `read_inventory`
- `search_inventory`
- `list_inventory`
- `get_item`

理由は、読み取りを ChatGPT の GitHub コネクタに委ね、Custom MCP の権限を GitHub 書き込み用途に絞るため。

## GitHub 書き込み仕様

GitHub への更新は GitHub Contents API を使う。

対象:

- owner: `achel-b8`
- repo: `kitchen-inventory`
- branch: `main`
- path: `inventory.json`

Vercel 環境変数:

- `MCP_API_KEY`: MCP エンドポイントを呼び出すための長いランダム API キー
- `GITHUB_TOKEN`: fine-grained personal access token
- `GITHUB_OWNER`: `achel-b8`
- `GITHUB_REPO`: `kitchen-inventory`
- `GITHUB_BRANCH`: `main`

`MCP_API_KEY` と `GITHUB_TOKEN` は secret として扱う。`GITHUB_TOKEN` は対象リポジトリの Contents read/write 権限だけを持つ fine-grained token を推奨する。

## Vercel 実装方針

最小構成:

```text
.
├── api/
│   └── mcp.ts
├── lib/
│   ├── github.ts
│   └── inventory-schema.ts
├── docs/
│   ├── specification.md
│   ├── usage.md
│   └── implementation-checklist.md
├── inventory.json
├── package.json
├── setup.md
├── tsconfig.json
└── vercel.json
```

採用候補:

- TypeScript
- `@modelcontextprotocol/sdk`
- `zod`
- Node.js 24 以上
- Vercel Serverless Function

## セキュリティ方針

MCP サーバーは GitHub 書き込み権限を持つため、公開 URL と API キーの扱いに注意する。

MCP エンドポイントは `MCP_API_KEY` による簡易認証を必須にする。API キーは `Authorization: Bearer <MCP_API_KEY>`、`X-API-Key: <MCP_API_KEY>`、または URL しか設定できないクライアント向けの `?api_key=<MCP_API_KEY>` で渡す。`MCP_API_KEY` が未設定の場合は公開状態で動かさず、設定エラーを返す。

必須ルール:

- GitHub token をリポジトリにコミットしない。
- Vercel 環境変数にだけ secret を保存する。
- token は対象リポジトリ限定、Contents read/write 限定にする。
- `MCP_API_KEY` は長いランダム値にし、URL で渡す場合は共有範囲を最小にする。
- ツール説明に secret や token を含めない。
- 書き込みツールは ChatGPT 側で確認してから実行する。
- `inventory.json` 以外のファイルを書き換えない。

## 受け入れ条件

- `inventory.json` が仕様通りの初期構造で存在する。
- Vercel がリポジトリを読み込み、ビルドできる。
- `/api/mcp` が MCP サーバーとして応答する。
- API キーなしの `/api/mcp` は拒否される。
- ChatGPT Developer mode から MCP を追加できる。
- `write_inventory` だけが公開される。
- `write_inventory` に正しい JSON を渡すと `inventory.json` が GitHub 上で更新される。
- 不正な分類、欠落した必須項目、負数の `数` は拒否される。
- `expected_updated_at` 不一致時は上書きせず競合エラーを返す。
- `setup.md` に Vercel と ChatGPT の設定手順が記載されている。
