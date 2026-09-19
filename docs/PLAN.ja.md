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
- [x] Phase 1 キックオフ (2026-07-07) — Done 条件とストーリーは
      [stories.ja.md](./stories.ja.md)、ワイヤー対象はログイン/未認証・会話ツリー・
      プロフィール・通知の 4 画面 (各セッション冒頭に just-in-time で描く)
- [x] Phase 1 セッション 1 (OAuth ログイン) 完了 (2026-07-12。ストーリーのチェックは
      スマホ実機確認待ち)
- [x] Phase 1 セッション 2 (Status カード) 完了 (2026-07-13。引用スコープは
      ADR-0007、サニタイズ/HTML パイプラインは ADR-0013。ストーリーのチェックは
      スマホ実機確認待ち)
- [x] Phase 1 セッション 4 (home タイムライン: 無限スクロール + gap-aware
      手動更新) 完了 (2026-08-07, PR #4)
- [x] Phase 1 セッション 6 (タイムライン切替: local / bubble / federated、
      パスベースルート + タブ) 完了 (2026-08-08。ストーリーのチェックは
      スマホ実機確認待ち)
- [x] Phase 1 セッション 7 (スレッド表示 + 読み位置の保持 + サインイン復帰) 完了
      (2026-08-09。会話ツリーは [ADR-0014](./adr/0014-thread-view.md)、未取得親の
      明示的な取り込みは ADR-0011 amendment、詳細ルートへの往復での保持は
      ADR-0004 amendment。ストーリーのチェックはスマホ実機確認待ち)
- [ ] Phase 1 進行中 (ストーリーの実装は 2026-09-13 に出揃った — プロフィールの
      pinned 表示と「誰が」一覧が最後。残りは dogfooding とスマホ実機確認。通知は
      2026-09-13 に Phase 2 へ — 既読管理が write scope を要するため。
      根拠は [stories.ja.md](./stories.ja.md) の Phase 2 冒頭)
      - PC dogfooding は 2026-09-14 に開始 (local dev server)。指摘の修正は
        stories.ja.md の各ストーリーに記録
      - **Phase 3 の最小スライスを Phase 1 の締めに前倒し** (2026-09-14 決定):
        Done 条件の「スマホ実機」と「pleroma-fe を開かずに 1 日」は localhost では
        測れず、[ADR-0005](./adr/0005-deployment.md) も dogfooding を本番で行う前提。
        `pnpm build` → `frontends/utaita/<ref>` レイアウトの zip → リファレンス
        インスタンスへ手動インストール → 自分の `preferred_frontend` 切替、まで。
        CI とリリース自動化は Phase 3 に残す

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
- [ ] タイムライン: home / local / bubble (Akkoma 独自) / federated、
      無限スクロールと新着の手動更新付き
- [ ] Status カード: サニタイズ済み HTML 本文、カスタム絵文字、添付メディア、
      CW/sensitive、絵文字リアクション表示、ブースト表示、投票・リンクプレビューの閲覧
- [ ] スレッド (会話ツリー) 表示 ([ADR-0014](./adr/0014-thread-view.md)。未取得の親は
      自動 resolve ではなく明示的な取り込み操作で — ADR-0011 amendment)
- [ ] プロフィールページ (ヘッダ、投稿/返信/メディアのタブ、フォロー関係の表示)

学びの目標: OAuth2 authorization code フローの手実装。カーソルページネーション
(`max_id`/`min_id`、Link ヘッダ、辞書順ソート可能な 128bit ID)。API レスポンスと
ActivityPub アクティビティの対応 (ブースト = `Announce`、ファボ = `Like`、
絵文字リアクション = `EmojiReact`)。公開範囲 = AP のアドレッシング (`to`/`cc`、
followers コレクション、Akkoma の `local`)。UI に現れる連合の痕跡 (リモート画像の
`blurhash`/`meta` 欠落、bubble タイムラインの近隣インスタンス概念)。

## Phase 2 — 書き込み

- [ ] 通知 (既読管理込み。`pleroma:emoji_reaction`, `move` など未知の type で
      落ちない。トークン scope を `read write` に広げた直後に着手 — 既読を付ける
      API がすべて write scope のため。2026-09-13 に Phase 1 から移動)
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
- 差別化 UX (Phanpy 風キャッチアップビューなど)、i18n (カード時刻表示の
  再設計・タイムゾーン設定を含む — stories の Icebox 参照)、a11y 強化、PWA

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
- 親がローカル DB に未取得の返信では `in_reply_to_id` が実在の ID ではなく
  プレースホルダー文字列 `"_"` になる (`in_reply_to_account_id` も同様)。実際の
  親は `akkoma.in_reply_to_apid` (AP URI) にのみ入る。`/api/v2/search` の
  `resolve=true` でサーバに取得させてから context を再取得する経路がある
  (2026-07-07 に実測。resolve がスレッドをどこまで遡るかは未検証)。
  resolve は 1 回あたり 2.6 秒前後かかる (2026-08-09 に実測、2 サンプル)。
- **`/api/v1/statuses/:id/context` の ancestors / descendants の振り分けは信用できない。**
  resolve で後から取り込んだ親は、子の `descendants` 側に入る (2026-08-09 に実測、
  2/2 で再現)。子の `in_reply_to_id` は正しく実 ID に変わるので、リンク自体は張れている。
  ancestors + descendants + 起点の和集合を取り、`in_reply_to_id` だけからツリーを
  組み立てて祖先/子孫はクライアント側で導出すること。
- **status の `pinned` は閲覧者を問わず常に付く。** spec の説明「pinnable のときのみ
  現れる」に反し、`StatusView` の `pin_data/2` は閲覧者ではなく作者の
  `pinned_objects` を見る (2026-09-13 に Akkoma ソースで確認、匿名取得でも
  `pinned: true` が返る)。本人判定には使えない。
- **リモートアカウントの pinned は `max_pinned_statuses` を超えて複数入る。**
  既定値 1 はローカルの pin 操作の上限で、連合で届く featured コレクションは
  そのまま取り込まれる (2026-09-13 に実測: misskey.io のアカウントで 3 件)。
  `?pinned=true` は `exclude_replies` / `only_media` と AND で結ばれ、ページネーションも
  通常どおり効く。
- **ID の辞書順が時系列順に一致するのは「タイムラインに流れてくる投稿」に限られる。**
  flake ID はローカル DB への挿入順なので、後から取り込んだ古い投稿は新しい ID を
  持つ (2026-08-09 に実測: 親の `created_at` が 1〜2 分古いのに ID は子より大きい)。
  スレッド内の並び順には `created_at` を使うこと。ページネーションの ID 順依存
  (ADR-0004 amendment のセグメント合流) はサーバ側の順序なので影響を受けない。
- ページネーション情報は `Link` ヘッダのみ (レスポンスボディに無い)。`limit` は
  指定しても 40 でクランプされる (2026-07-07 に実測)。
- ステータス等の ID は 18 文字固定長・base62 の flake ID で、辞書順比較が
  時系列順に一致する (新しいほど大きい。2026-07-20 に実測: 実ページ 40 件で ID の
  辞書順降順 = `created_at` 降順、全 ID が 18 文字)。タイムラインのセグメント
  合流・重複排除 (ADR-0004 amendment) とテストフィクスチャの ID 設計はこの性質に
  依存する。
- 絵文字リアクションは Unicode 絵文字だと `url` が null、リモートカスタム絵文字だと
  `name` が `shortcode@host` 形式で `url` に画像 URL が入る。null 分岐を忘れると
  描画が壊れる。同じ配列がトップレベル `emoji_reactions` と
  `pleroma.emoji_reactions` に重複して来る (2026-07-07 に実測)。
- インスタンス配信の spec に実レスポンスへ遅れているフィールドがある:
  `Attachment.blurhash` / `Attachment.meta`、絵文字リアクションの `url` /
  `account_ids` は spec に無いが実測では来る (2026-07-13 に確認)。生成型に無い
  フィールドは境界パース (`in` ナローイング) で補う。逆に poll の `voted` /
  `own_votes` は spec 上 nullable だが未認証時はキー自体が欠落する。
- カスタム絵文字は `content` HTML 内で `:shortcode:` テキストのまま配信される
  (`<img>` 化されない、2026-07-13 に実測)。クライアントが `emojis` 配列で置換する。
- 引用投稿の `content` にはサーバが `<span class="quote-inline">` で RE: リンクを
  自動付加する (投稿者ソースには無い)。引用カードを描画するときだけ除去する
  (ADR-0007)。
- **`/api/v1/accounts/:id/followers` と `/following` の `:id` は flake id のみ**
  (`assign_account_by_id` → `User.get_cached_by_id`)。`/accounts/:id` と
  `/accounts/:id/statuses` が受ける nickname は 404 になる (2026-09-13 に実測)。
  ページネーションは相手アカウント自身の id が `max_id` (Link ヘッダの next も
  同じ)。非公開一覧 (`pleroma.hide_follows` / `hide_followers`) は本人以外に
  200 で `[]` が返る。数の非公開 (`hide_*_count`) で `following_count` /
  `followers_count` が 0 になるのは両方のフラグが立っているときだけで、
  `hide_*_count` 単独では実数が来る — 値ではなくフラグを見ること。
- **`/statuses/:id/favourited_by`、`/reblogged_by`、`/pleroma/statuses/:id/reactions`
  はページネーションしない** (`status_controller.ex` は likes / announcements の全
  ap_id を `Repo.all` で引き、`add_link_headers` を呼ばない。`emoji_reaction_controller.ex`
  も同様。2026-09-13 に Akkoma ソースで確認)。`limit` / `max_id` は受けず、全件が
  1 応答で来る。見えない投稿への応答は揃っていない: favourited_by / reblogged_by は
  **404**、reactions は **403**。`show_reactions: false` のインスタンスでは
  favourited_by と reactions が `200 []` (reblogged_by は無条件)。
- **status に埋め込まれる `emoji_reactions` と `/pleroma/statuses/:id/reactions` は
  形が違う**: 埋め込みは `account_ids` (id の配列) のみ、専用エンドポイントは
  `accounts` (Account の配列)。また spec の `EmojiReactionController.index` は
  `/reactions/{emoji}` のパラメータ定義を写しているため、生成型がパスに無い `emoji`
  を要求する。openapi-fetch はテンプレートにある `{name}` しか置換しないので、
  空文字を渡せば無害 (`src/pages/thread/who-lists-api.ts`)。
- Bearer 認証されたリクエストに対して Akkoma は httpOnly のセッション Cookie も
  `Set-Cookie` で返す。dev proxy 越しだとこの Cookie が localhost に保存され、
  proxy のトークン注入を外してもブラウザは認証されたままになる (2026-07-06 に
  実測)。「未認証の挙動」をブラウザで確かめるときは Cookie を消すこと。OAuth
  実装時のログアウト検証でも同じ罠に注意。
- **Bearer トークンはセッション Cookie に写り、Authorization ヘッダーの無いリクエストは
  その Cookie で認証される。** `SetUserSessionIdPlug` がトークンをセッションに保存し、
  `OAuthPlug` はパラメータ・ヘッダーに無ければセッションのトークンを使う
  (2026-09-19 に Akkoma ソースで確認)。本番でも同一オリジンなので、ログアウト後や
  revoke 失敗後の「匿名」取得が認証されてしまう。API クライアントは
  `credentials: "omit"` で Cookie を送らない (`src/api/client.ts`)。ただし OAuth の
  フォーム POST (`src/api/oauth.ts`) は omit に揃えないこと: `/oauth/token`
  の応答も Cookie を発行し (`after_token_exchange`)、`/oauth/revoke` は送られてきた
  Cookie のトークンが revoke 対象と一致するときだけそのセッションを消す
  (`o_auth_controller.ex`)。
- **フロントエンドのルートは Akkoma が root で所有する prefix を避ける** (2026-09-16 に
  ringed.space / Akkoma 3.20 で実測)。Akkoma は `/users/:nickname` 配下を actor 用に
  広く持つ: feed redirect、`feed`、static-fe の `with_replies` / `media`、AP の
  `inbox` / `outbox` / `followers` / `following` / `collections/featured`、
  `statuses/:id`。これらは `Accept: text/html` でも Akkoma 自身が応答し、SPA の
  index.html にならない。加えて `:param` で終わるルートでは Phoenix が最後のドット
  以降を `_format` と解釈するので、`user@host.tld` 形式の acct を末尾に置くと 406。
  glob (`/*path`) の fallback ではこの解釈は起きない。**dev proxy は全パスに
  index.html を返すため localhost では一切見えない**。root 所有の prefix は
  `router.ex` で `/`, `/@`, `/users`, `/notice`, `/objects`, `/activities`, `/tags`,
  `/web`, `/main`, `/auth`, `/inbox`, `/embed`, `/registration`, `/mailer`,
  `/akkoma`, `/relay`, `/internal`, `/nodeinfo`, `/proxy`, `/api`, `/oauth`,
  `/.well-known` など。新しい prefix は `curl -s -o /dev/null -w "%{http_code} %{content_type}" -H "Accept: text/html" https://<instance>/<prefix>/...`
  で index.html が返ることを確かめてから使う。プロフィールはこの理由で
  `/accounts/:acct` (stories のプロフィール story)。
- **ローカル発の引用投稿は被引用投稿の context を継承する。** `CommonAPI.Utils.make_context/1`
  は `in_reply_to` が無ければ `quote` の context を使い、`/context` は context 一致で拾って
  ID の大小だけで ancestors / descendants に振り分ける (`in_reply_to` は見ない)。結果、
  引用投稿の `/context` に被引用投稿とそのスレッド全体が、被引用投稿の `/context` に
  引用投稿とその返信が、返信チェーン無しで混ざる (2026-09-16 に Akkoma ソースで確認)。
  継承は投稿を作ったインスタンスの側で起きる: 受信側は `quoteUri` から context を作り直さないが、
  届いたオブジェクトの `context` はそのまま保持する (`Transmogrifier.fix_context/1`) ので、
  Akkoma / Pleroma 系のリモート発の引用でも同じ混入が届く。ローカル発かどうかで絞らないこと。
  スレッドの再構築では引用関係で繋がる detached の連なりを落とすこと (thread-tree.ts)。
  - `make_context/1` は `in_reply_to` の節が `quote` の節より先にある。返信でもある引用は
    返信先の context を継ぐので、継承が起きるのは**非返信の引用だけ**。引用する側が返信なら、
    その引用リンクを「context が混ざった証拠」に数えてはいけない。
  - 引用先の投稿者を閲覧者がミュート / ブロックしている (または引用先が見えない) と、
    `maybe_render_quote` が nil を返して `quote` は null になるが、`quote_id` は残る
    (`status_view.ex`)。引用関係は `quote_id` で辿ること。引用先が DB に無いときの
    `quote_id` は ghost の `"_"` で、どの投稿も指さない。
- **匿名リクエストへの応答は可視性で変わる。** `instance.public: true` (既定) では公開 /
  unlisted の status、`/context`、アカウント、投稿一覧、フォロー一覧、who-lists が 200、
  private / direct の status は **404** (401 / 403 ではない — `visible_for_user?` が nil
  user で false)。`verify_credentials` と `/accounts/relationships` は 403。
  `instance.public: false` では `/context` が可視性を問わず一律 403 (`show` は返る)。
  2026-09-16 に ringed.space で実測。フロントで visibility を見て隠さず、応答に従う (ADR-0015)。
