# ロードマップ (正本)

> この日本語版が正本。フェーズの区切りで英語版 [PLAN.md](./PLAN.md) に同期する。

## ゴール

Akkoma のモダンな Web frontend。静的ファイルとして配布し、インスタンス自身が
`$instance_static/frontends/<name>/<ref>` から配信する。API は常に同一オリジン
前提で、インスタンス選択 UI は持たない。開発と dogfooding はリファレンス
インスタンスで行うが、インスタンス固有の値をハードコードしない。

## 技術スタック

- SolidJS + @solidjs/router, Vite, Panda CSS, Biome, pnpm
- API 型はインスタンスが配信する OpenAPI spec (`/api/openapi`) から
  openapi-typescript で生成し、openapi-fetch で利用 — [ADR-0002](./adr/0002-api-client.md)
- データ取得は @solidjs/router のデータプリミティブ (`query`/`createAsync` + route `preload`)。
  タイムラインの無限スクロールはカーソルページ蓄積を自作 — [ADR-0004](./adr/0004-data-fetching.md)

## 現在地

- [x] 調査: Akkoma の API・認証・Streaming・frontend デプロイ
- [x] 調査: 先行事例 (Elk, Phanpy, Soapbox, pleroma-fe) と SolidJS エコシステム
- [x] リファレンスインスタンスの spec で型生成を検証 (173 paths, 79 schemas)
- [x] Phase 0 完了 (2026-07-06)
- [ ] Phase 1 キックオフ待ち

## Phase 0 — 基盤

- [x] `openapi.json` をコミットし、spec 取得 + 型再生成の pnpm script を追加
      (生成型もコミット、取得元 URL は env 化 — ADR-0002 amendment)
- [x] openapi-fetch ラッパー (`Result<T, ApiError>` ベース — [ADR-0008](./adr/0008-api-errors-as-values.md)。
      認証ヘッダ注入は Phase 1、401 は値として表現済み)
- [x] Vite dev proxy (`/api`, `/oauth`, `/nodeinfo` → リファレンスインスタンス、
      token サーバ側注入 — ADR-0006 実装)
- [x] solid-router のデータプリミティブ (`query`/`createAsync`) の使い方を確立、
      entities/pages ベースのディレクトリ構成 ([ADR-0010](./adr/0010-directory-structure.md)。
      エラーは値のまま UI へ — ADR-0008 amendment)
- [x] Panda のデザイントークン (パレット、タイポグラフィ、spacing、radius。
      ライトテーマのみ — ダークモードは個人用途につき不採用、
      根拠は [design/tokens.md](./design/tokens.md))
- [x] 影響が最も大きい 2 つのラフワイヤー: アプリシェルと Status カード
      ([app-shell](./design/app-shell-20260705.html), [status-card](./design/status-card-20260705.html))

学びの目標: OpenAPI 駆動の開発。Akkoma が自身の API をどう公開しているか。

## Phase 1 — 閲覧 MVP

書き込みより先に「毎日開くクライアント」にする。

- [ ] OAuth ログイン (動的アプリ登録、[ADR-0003](./adr/0003-oauth.md)) とセッション管理
- [ ] タイムライン: home / local / bubble (Akkoma 独自) / federated、無限スクロール付き
- [ ] Status カード: サニタイズ済み HTML 本文、カスタム絵文字、添付メディア、
      CW/sensitive、絵文字リアクション表示、ブースト表示
- [ ] スレッド (会話ツリー) 表示
- [ ] プロフィールページ (ヘッダ、投稿/返信/メディアのタブ、フォロー関係の表示)
- [ ] 通知 (閲覧のみ。`pleroma:emoji_reaction`, `move` など未知の type で落ちない)

学びの目標: OAuth2 authorization code フローの手実装。カーソルページネーション
(`max_id`/`min_id`、Link ヘッダ、辞書順ソート可能な 128bit ID)。API レスポンスと
ActivityPub アクティビティの対応 (ブースト = `Announce`、ファボ = `Like`、
絵文字リアクション = `EmojiReact`)。公開範囲 = AP のアドレッシング (`to`/`cc`、
followers コレクション、Akkoma の `local`)。UI に現れる連合の痕跡 (リモート画像の
`blurhash`/`meta` 欠落、bubble タイムラインの近隣インスタンス概念)。

## Phase 2 — 書き込み

- [ ] Compose: テキスト、CW、公開範囲 (Akkoma の `local` 含む)、カスタム絵文字補完
- [ ] alt text 付きメディアアップロード (見た目より重いので独立タスク)
- [ ] ファボ / ブースト / ブックマーク / 絵文字リアクション
      (`PUT /api/v1/pleroma/statuses/:id/reactions/:emoji`)
- [ ] フォロー管理
- [ ] 検索 (v2)

学びの目標: WebFinger (`@user@host` の解決)、nodeinfo。連合バックエンドに対する
冪等性と楽観的更新。

## Phase 3 — 本番デプロイ

- [ ] `frontends/<name>/<ref>` 向けのビルド成果物レイアウト、リリース zip
- [ ] `preferred_frontend` による段階的ロールアウト → `primary` 切替 — [ADR-0005](./adr/0005-deployment.md)
- [ ] CI: check, typecheck, build, リリース成果物

学びの目標: Akkoma の運用。インスタンスが複数 frontend をどう配信するか。

## Phase 4 — その先

- Streaming API (WebSocket `/api/v1/streaming`、再接続/バックオフ設計)
- 下書き (IndexedDB)、リスト、フィルタ、必要になったらリスト仮想化
- 差別化 UX (Phanpy 風キャッチアップビューなど)、i18n、a11y 強化、PWA

学びの目標: Phoenix ベースの WebSocket リアルタイム。オフラインファーストの永続化。

## Akkoma 固有の落とし穴

- API はおおよそ Mastodon 2.7.2 + 拡張。新しめの Mastodon API は存在しない
  ことがある。インスタンスが配信する spec を正とする。
- スタブ値を返すエンドポイントがある (`/api/v1/trends`, `/api/v1/suggestions`
  → `[]`、`/api/v1/featured_tags` → 404)。
- `pleroma.content` / `pleroma.spoiler_text` は MIME タイプをキーにした map
  (Markdown, MFM など複数ソース形式対応のため)。
- 通知に Mastodon にない type が来る。未知の type で落ちない設計にする。
- リモート添付には `blurhash` / `meta` / 焦点情報が無いことがある。
- 未認証時の応答はエンドポイントごとに違う: home タイムラインは 403
  `{"error": "Invalid credentials."}`、public は 401 `{"error": "authorization
  required for timeline view"}`。認証要求の判定を 401 だけで行うと漏れる。
- Bearer 認証されたリクエストに対して Akkoma は httpOnly のセッション Cookie も
  `Set-Cookie` で返す。dev proxy 越しだとこの Cookie が localhost に保存され、
  proxy のトークン注入を外してもブラウザは認証されたままになる (2026-07-06 に
  実測)。「未認証の挙動」をブラウザで確かめるときは Cookie を消すこと。OAuth
  実装時のログアウト検証でも同じ罠に注意。
