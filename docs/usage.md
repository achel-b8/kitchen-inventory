# 運用ガイド

この文書は、現在の実装を使って `inventory.json` を読む、編集する、MCP で書き込むための運用手順をまとめる。

## 基本方針

- 在庫の正本はリポジトリ直下の `inventory.json`。
- 読み取りは GitHub コネクタ、GitHub UI、またはリポジトリのファイル参照で行う。
- 書き込みは Custom MCP の `write_inventory` だけで行う。
- MCP は読み取りツールを公開していない。
- `write_inventory` には差分ではなく、更新後の `inventory.json` 全体を渡す。
- 書き込み前に `expected_updated_at` を指定し、読み取り後の競合更新を検出する。

## 在庫を読む

対象ファイル:

```text
inventory.json
```

分類は次の4つだけ。

- `生鮮`
- `調味料`
- `乾物`
- `冷凍庫`

商品レコードの形:

```json
{
  "商品名": "卵",
  "追加日": "2026-04-26",
  "数": 10,
  "単位": "個"
}
```

`商品名` と `追加日` は必須。`数` と `単位` は任意。ただし、`単位` を入れる場合は `数` も必要。

## 在庫を追加する

同一レコードは、分類、`商品名`、`追加日`、`単位` の組み合わせで判定する。同じ組み合わせがすでにある場合はレコードを増やさず、既存レコードの `数` に加算する。

例: 生鮮に卵10個を追加する。

```json
{
  "商品名": "卵",
  "追加日": "2026-04-26",
  "数": 10,
  "単位": "個"
}
```

数量を管理しない場合は `数` と `単位` を省略できる。

```json
{
  "商品名": "薄口しょうゆ",
  "追加日": "2026-04-26"
}
```

## 在庫を消費する

`数` がある商品を消費する場合は、同じ `単位` の数量から差し引く。

更新前:

```json
{
  "商品名": "卵",
  "追加日": "2026-04-26",
  "数": 10,
  "単位": "個"
}
```

2個使った後:

```json
{
  "商品名": "卵",
  "追加日": "2026-04-26",
  "数": 8,
  "単位": "個"
}
```

`数` が 0 になったレコードは削除する。`数` がない商品は数量を減らせないため、使い切ったことが明確な場合だけレコードを削除する。

## MCP で書き込む

MCP endpoint:

```text
https://<vercel-project>.vercel.app/api/mcp
```

認証:

```text
Authorization: Bearer <MCP_API_KEY>
```

または:

```text
X-API-Key: <MCP_API_KEY>
```

ヘッダーを設定できないクライアントでは、URL query でも渡せる。

```text
https://<vercel-project>.vercel.app/api/mcp?api_key=<MCP_API_KEY>
```

`write_inventory` に渡す payload:

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

注意点:

- `inventory` には更新後の JSON 全体を入れる。
- `updated_at` は読み取り時点の値のままでよい。サーバー側で現在時刻に差し替えられる。
- `expected_updated_at` には読み取り時点の `updated_at` を入れる。
- `commit_message` は変更内容が分かる文にする。未指定時は `Update inventory`。

成功時は commit SHA、GitHub URL、サーバー側で更新された `updated_at` が返る。

## 書き込み前の確認

ChatGPT Developer mode の書き込み確認画面では、少なくとも次を確認する。

- `inventory.json` 全体が含まれている。
- 分類が `生鮮`、`調味料`、`乾物`、`冷凍庫` の4つだけ。
- 必要な商品が意図せず削除されていない。
- `商品名` と `追加日` が欠落していない。
- `追加日` が `YYYY-MM-DD`。
- `数` が 0 以上。
- `単位` だけの指定になっていない。
- 同一分類内に同じ `商品名`、`追加日`、`単位` の重複がない。
- `expected_updated_at` が読み取り時点の値。
- `commit_message` が変更内容に合っている。

## エージェント向けプロンプト例

在庫追加:

```text
GitHub コネクタで inventory.json を読み、現在の updated_at を expected_updated_at として保持してください。
生鮮に卵を10個、追加日 2026-04-26、単位 個で追加してください。
同一分類、同一商品名、同一追加日、同一単位の既存レコードがあれば数を加算してください。
更新後の inventory.json 全体を kitchen-inventory MCP の write_inventory に渡してください。
読み取りには MCP を使わず、書き込みだけ MCP を使ってください。
```

在庫消費:

```text
GitHub コネクタで inventory.json を読み、現在の updated_at を expected_updated_at として保持してください。
卵を2個使ったので、生鮮の該当レコードから2を差し引いてください。
数が0になったレコードは削除してください。
更新後の inventory.json 全体を kitchen-inventory MCP の write_inventory に渡してください。
```

他ファイル変更の防止:

```text
inventory.json の読み取りは GitHub コネクタを使ってください。
inventory.json の書き込みは kitchen-inventory MCP の write_inventory だけを使ってください。
他のファイルは変更しないでください。
```

## ローカル検証

依存関係、型検査、テスト:

```bash
npm install
npm run typecheck
npm test
```

在庫 JSON の schema validation だけ確認する場合:

```bash
npm run validate:inventory
```

## トラブルシュート

### `schema_error`

分類キー、必須項目、日付形式、負数の `数`、`単位` だけの指定、重複レコードを確認する。`schema_error` の場合、GitHub 更新処理には進まない。

### `conflict`

読み取り後に `inventory.json` が更新されている。最新の `inventory.json` を読み直し、変更内容を再適用してから再実行する。

### `configuration_error`

Vercel の環境変数を確認する。`write_inventory` では `GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` が必要。HTTP endpoint では `MCP_API_KEY` が必要。

### `unauthorized`

MCP request に API key が含まれていないか、`MCP_API_KEY` と一致していない。`Authorization` header、`X-API-Key` header、または `api_key` query を確認する。

### `github_error`

GitHub token の repository scope、Contents read/write 権限、対象 branch、GitHub API の応答を確認する。

### MCP で読み取れない

仕様通り。MCP は `write_inventory` だけを公開している。読み取りは GitHub コネクタ、GitHub UI、またはリポジトリ参照で行う。
