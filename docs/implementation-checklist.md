# 実装チェックリスト

このチェックリストに沿って、空のリポジトリから Vercel デプロイ可能な Custom MCP まで順番に実装する。

環境変数の実値設定、GitHub token の発行、ChatGPT 接続は最後の統合段階で行う。前半では secret を必要としない実装とローカル検証を優先する。

## 1. 最小ファイル構成を作る

- [ ] `package.json` を作成する。
- [ ] `tsconfig.json` を作成する。
- [ ] `vercel.json` を作成する。
- [ ] `api/mcp.ts` を作成する。
- [ ] `lib/inventory-schema.ts` を作成する。
- [ ] `lib/github.ts` を作成する。
- [ ] `inventory.json` を作成する。
- [ ] ルート直下に `setup.md` を作成する。

## 2. Node.js と依存関係を定義する

- [ ] Node.js 24 以上を前提にする。
- [ ] `package.json` の `engines.node` に `>=24` を設定する。
- [ ] `@modelcontextprotocol/sdk` を追加する。
- [ ] `zod` を追加する。
- [ ] TypeScript 実行と型検査に必要な dev dependencies を追加する。
- [ ] `npm run typecheck` を定義する。
- [ ] Vercel が TypeScript API Route をビルドできる構成にする。

## 3. `inventory.json` の初期データを作る

- [ ] `schema_version` を `1` にする。
- [ ] `updated_at` を ISO 8601 文字列で入れる。
- [ ] `inventory` 直下に `生鮮`、`調味料`、`乾物`、`冷凍庫` を置く。
- [ ] 4分類はすべて空配列で初期化する。
- [ ] サンプル商品は初期ファイルに入れない。
- [ ] JSON が整形済みであることを確認する。

## 4. 在庫スキーマ検証を実装する

- [ ] `lib/inventory-schema.ts` に Zod schema を定義する。
- [ ] `商品名` を必須の非空文字列として検証する。
- [ ] `追加日` を `YYYY-MM-DD` として検証する。
- [ ] `数` を任意の 0 以上の数値として検証する。
- [ ] `単位` を任意の非空文字列として検証する。
- [ ] `単位` が指定された場合は `数` も必要にする。
- [ ] `inventory` の分類キーが固定4分類だけであることを検証する。
- [ ] 固定4分類が欠落していないことを検証する。
- [ ] 同一分類、同一商品名、同一追加日、同一単位の重複を拒否する。
- [ ] スキーマ違反時に GitHub 更新処理へ進まない API にする。

## 5. GitHub 更新処理を実装する

この段階では環境変数名をコードから参照できるようにするだけで、Vercel への実値設定は行わない。

- [ ] `lib/github.ts` に GitHub Contents API 用の関数を実装する。
- [ ] `GITHUB_TOKEN` を実行時環境変数から読む。
- [ ] `GITHUB_OWNER` を実行時環境変数から読む。
- [ ] `GITHUB_REPO` を実行時環境変数から読む。
- [ ] `GITHUB_BRANCH` を実行時環境変数から読む。
- [ ] 環境変数不足を検出する関数を作る。
- [ ] GitHub Contents API で現在の `inventory.json` を取得する。
- [ ] 取得したファイル SHA を更新 API に渡す。
- [ ] `expected_updated_at` が指定されている場合は現在値と比較する。
- [ ] 不一致なら conflict エラーを返し、更新しない。
- [ ] 書き込み前に `updated_at` をサーバー側で更新する。
- [ ] `inventory.json` 以外の path を更新できない実装にする。
- [ ] commit message 未指定時は `Update inventory` を使う。
- [ ] 更新成功時に commit SHA と GitHub URL を返す。

## 6. MCP エンドポイントを実装する

- [ ] `/api/mcp` で Streaming HTTP の MCP エンドポイントを公開する。
- [ ] MCP サーバー名を `kitchen-inventory` にする。
- [ ] ツールは `write_inventory` だけを登録する。
- [ ] `read_inventory`、`search_inventory`、`list_inventory` を登録しない。
- [ ] `write_inventory` の説明に、`inventory.json` だけを更新することを明記する。
- [ ] `write_inventory` の input schema を `zod` で定義する。
- [ ] `write_inventory` からスキーマ検証と GitHub 更新処理を呼び出す。
- [ ] ツール結果は JSON 文字列として返す。

## 7. エラー設計を実装する

- [ ] schema error は `ok: false`, `error: "schema_error"` を返す。
- [ ] conflict は `ok: false`, `error: "conflict"` を返す。
- [ ] GitHub API error は `ok: false`, `error: "github_error"` を返す。
- [ ] 環境変数不足は `ok: false`, `error: "configuration_error"` を返す。
- [ ] 予期しないエラーは token などの secret を含めず返す。
- [ ] HTTP レスポンスと MCP tool result のエラー形式をそろえる。

## 8. secret なしでローカル検証する

- [ ] `npm install` が成功する。
- [ ] `npm run typecheck` が通る。
- [ ] `inventory.json` が schema validation を通る。
- [ ] 不正な分類を渡すと拒否される。
- [ ] `商品名` 欠落時に拒否される。
- [ ] `追加日` の形式不正時に拒否される。
- [ ] `数` が負数の時に拒否される。
- [ ] `単位` だけが指定されている時に拒否される。
- [ ] 重複レコードが拒否される。
- [ ] 環境変数未設定時に `configuration_error` になる。
- [ ] ローカルで MCP エンドポイントが起動する。
- [ ] `write_inventory` だけが tool list に出ることを確認する。

## 9. `setup.md` を作る

- [ ] Vercel への import 手順を書く。
- [ ] Node.js 24 以上を前提にすることを書く。
- [ ] GitHub fine-grained token の作成手順を書く。
- [ ] token の必要権限を Contents read/write のみに限定して書く。
- [ ] Vercel Environment Variables の設定手順を書く。
- [ ] ChatGPT Developer mode の有効化手順を書く。
- [ ] Custom MCP URL の設定手順を書く。
- [ ] 書き込み確認時に payload を確認する運用を書く。
- [ ] トラブルシュートを書く。

## 10. ドキュメント整合性を確認する

- [ ] `docs/specification.md` と実装内容が一致している。
- [ ] `docs/usage.md` にエージェント向けの読み書き手順がある。
- [ ] `docs/implementation-checklist.md` が現在の実装順に沿っている。
- [ ] `setup.md` に Vercel env vars の設定手順がある。
- [ ] `setup.md` に ChatGPT Developer mode 接続手順がある。
- [ ] `setup.md` にトラブルシュートがある。

## 11. セキュリティを確認する

- [ ] `MCP_API_KEY` がファイルに書かれていない。
- [ ] `GITHUB_TOKEN` がファイルに書かれていない。
- [ ] `.env` がある場合は `.gitignore` されている。
- [ ] API キーなしの `/api/mcp` が拒否される。
- [ ] GitHub token が対象リポジトリだけに限定されている。
- [ ] GitHub token の権限が Contents read/write に限定されている。
- [ ] MCP tool の説明や戻り値に secret が含まれない。
- [ ] エラーメッセージに GitHub token や request header が含まれない。
- [ ] URL で API キーを渡す場合は共有範囲を最小にする。

## 12. GitHub token と Vercel 環境変数を設定する

ここから secret を扱う。token の値はリポジトリに保存しない。

- [ ] 長いランダム値の `MCP_API_KEY` を作成する。
- [ ] GitHub で fine-grained personal access token を作成する。
- [ ] token の対象 repository を `achel-b8/kitchen-inventory` に限定する。
- [ ] token の権限を Contents read/write に限定する。
- [ ] Vercel project を GitHub リポジトリに接続する。
- [ ] Framework Preset は Other または自動検出にする。
- [ ] Build Command を設定する。
- [ ] Output Directory は不要にする。
- [ ] `MCP_API_KEY` を Vercel Environment Variables に設定する。
- [ ] `GITHUB_TOKEN` を Vercel Environment Variables に設定する。
- [ ] `GITHUB_OWNER=achel-b8` を設定する。
- [ ] `GITHUB_REPO=kitchen-inventory` を設定する。
- [ ] `GITHUB_BRANCH=main` を設定する。
- [ ] Production / Preview の両方で必要な env が入っていることを確認する。

## 13. Vercel デプロイ後に結合テストする

- [ ] Vercel production deploy が成功する。
- [ ] Production URL の `/api/mcp` が利用可能である。
- [ ] 正常な `inventory` を渡すと GitHub 上の `inventory.json` が更新される。
- [ ] `expected_updated_at` 不一致時に更新されない。
- [ ] 更新結果が GitHub の `main` ブランチにコミットされる。
- [ ] 不正 JSON と競合更新が安全に拒否される。

## 14. ChatGPT に接続する

- [ ] ChatGPT の Developer mode を有効化する。
- [ ] Apps / Connectors 設定から Custom MCP / App を作成する。
- [ ] MCP URL に `https://<vercel-project>.vercel.app/api/mcp` を設定する。
- [ ] MCP tool list を更新する。
- [ ] `write_inventory` だけが表示されることを確認する。
- [ ] 会話内で Developer mode tool として `kitchen-inventory` を選択する。
- [ ] ChatGPT が GitHub コネクタで読んだ `inventory.json` を MCP 経由で更新できる。

## 15. 完了条件

- [ ] Node.js 24 以上を前提にした構成になっている。
- [ ] Vercel production URL の `/api/mcp` が利用可能である。
- [ ] ChatGPT Developer mode から MCP を追加できる。
- [ ] `write_inventory` だけが公開されている。
- [ ] ChatGPT が GitHub コネクタで読んだ `inventory.json` を MCP 経由で更新できる。
- [ ] 更新結果が GitHub の `main` ブランチにコミットされる。
- [ ] 不正 JSON と競合更新が安全に拒否される。
