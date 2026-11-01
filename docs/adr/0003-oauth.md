# 0003: OAuth via dynamic app registration; phased token scopes; no PKCE available

- Status: accepted
- Date: 2026-07-04

## Context

Akkoma's OAuth implementation supports exactly the `authorization_code`,
`refresh_token`, `password`, and `client_credentials` grants. PKCE is not
implemented (verified against the `develop` branch: no
`code_challenge`/`code_verifier` handling in `o_auth_controller.ex`,
`token.ex`, or `authorization.ex`). `POST /api/v1/apps` requires no
authentication (`:skip_auth` plug, `:app_api` pipeline), so the client can
register itself against whatever instance serves it.

Scopes are hierarchical, Mastodon-style (`read`, `write`, `follow`, `push`
plus sub-scopes like `read:statuses`); an app registered without a scope
param defaults to `["read"]`. Access tokens effectively never expire by
default (`token_expires_in: 3600 * 24 * 365 * 100` — 100 years), so the
`refresh_token` grant serves rotation, not expiry. A leaked token stays
valid until explicitly revoked.

## Decision

Use the authorization code flow. On first login, register an app via
`POST /api/v1/apps` with the full scope set `read write follow push` —
registration carries no capability by itself and doing it once avoids
re-registering later. Request tokens with only the scopes the current phase
uses: `read` during the read-only MVP (Phase 1), widened at Phase 2 by
re-authorizing with broader scopes (no re-registration needed). Persist the
client credentials and tokens in `localStorage`. Do not use the `password`
grant — the frontend must never see the user's password.

## Consequences

- Because tokens are effectively non-expiring and live in `localStorage`,
  least privilege on the token matters. From Phase 2 on a token carries
  `write`, so a leaked one can post as the user; a Phase 1 `read` token is
  revoked at the browser's next sign-in (Amendment). The re-authorization
  Phase 2 costs depends on the instance's session cookie: one consent screen
  where the cookie still holds a valid token, otherwise the password form or
  a retry for each write-less token the instance hands back.
- Client credentials in `localStorage` are readable by any script on the
  origin; without PKCE this is the ceiling of what a browser-only public
  client can do, and it matches established practice (Elk, Phanpy,
  pleroma-fe). XSS hardening (sanitization, CSP) is the real defense.
- Because the app is served by the instance, registration happens exactly
  once per instance — no instance-selection or multi-registration logic.
- If Akkoma gains PKCE upstream, adopt it and supersede this ADR.

## Amendment (2026-11-01): request `read write`, store no token without both, revoke the Phase 1 token at the next sign-in

Phase 2's stories all need `write`. The Akkoma behavior below decides how a
browser holding a Phase 1 `read` token gets there (Akkoma `develop`, commit
`a69f0b9e3`, verified 2026-11-01):

- The session cookie (`Plug.Session`, no `max_age`) lives for the browser
  session. Exchanging a code at `/oauth/token` writes that token and the user
  into it (`after_token_exchange`). `/oauth/revoke` drops the token from the
  cookie only when it is the revoked one, and never drops the user
  (`token_revoke`). Any authenticated API request also writes its bearer
  token into the cookie (`SetUserSessionIdPlug`), so while a session works
  the cookie holds the stored token.
- `/oauth/authorize` branches on the cookie. With a valid token and no
  `force_login`, it redirects at once with `?access_token=` instead of a code
  (issue #56); with `force_login=true` it shows the consent screen. With only
  the user left, `force_login` is ignored: if this app and user still have an
  unexpired token and authorization, a code comes back with no screen, and
  exchanging a spent code returns the most recently updated existing token
  (`maybe_reuse_token`); otherwise, and with no cookie at all, the password
  form appears.
- Both forms post the scopes as checkboxes (`_scopes.html.eex`), but the
  instance's stylesheet hides them (`static-fe/forms.css`), so the reader
  cannot narrow the grant on the page. A token with less than was requested
  comes back when the instance reissues an existing one, or when the form is
  posted with boxes unticked by other means. The consent screen's Cancel is
  a link to `/`, so no `access_denied` reaches the callback; the password
  form has no Cancel.

So:

- Authorization requests `scope=read write` with `force_login=true`.
- Tokens are stored under a new key (`utaita:token`). The Phase 1 key is not
  read as a session, so those browsers start signed out and sign in through
  the ordinary gate; the app never redirects to authorize on its own, which
  keeps Cancel from looping.
- After an exchange succeeds, the Phase 1 token is revoked, and its key is
  removed only once the revoke succeeds, so a failed one is retried at the
  next sign-in. The exchange has just moved the cookie to the new token, so
  that revoke cannot end the session.
- A token response whose `scope` lacks `read` or `write` is not stored: the
  token is revoked, so a retry from a user-only cookie is not handed the same
  token again, and the sign-in fails with the granted scope in the message.
  A stored token is left untouched, so a failed re-sign-in never breaks a
  working session. When the returned token is the Phase 1 one (reissued from
  a user-only cookie with no screen), the message says so instead of
  reporting a scope the reader never chose, and the Phase 1 key is removed
  once that revoke succeeds.
- The scope is judged once, at the exchange, and not stored. There is no
  "signed in but read-only" state; ADR-0015's treatment of 401 and 403 is
  unchanged.

Verified by hand on 2026-11-01: the write-less paths through a dev server
proxied to the reference instance, with the form posted with `write`
unticked, and the migration of a Phase 1 browser on the reference instance
itself. The steps and results are in the description of PR #111.

## References

- Akkoma `develop` branch, source-verified 2026-07 via akkoma.dev raw files:
  `lib/pleroma/web/o_auth/o_auth_controller.ex`,
  `lib/pleroma/web/o_auth/token.ex`,
  `lib/pleroma/web/mastodon_api/controllers/app_controller.ex`,
  `lib/pleroma/web/router.ex`, `config/config.exs` (`:oauth2` section)
- https://docs.akkoma.dev/stable/development/authentication_authorization/
- Amendment: Akkoma `develop` branch, commit `a69f0b9e3`
  (https://akkoma.dev/AkkomaGang/akkoma/src/commit/a69f0b9e3/),
  source-verified 2026-11-01:
  `lib/pleroma/web/o_auth/o_auth_controller.ex`,
  `lib/pleroma/web/o_auth/token.ex`,
  `lib/pleroma/web/o_auth/token/query.ex`,
  `lib/pleroma/web/plugs/o_auth_plug.ex`,
  `lib/pleroma/web/plugs/set_user_session_id_plug.ex`,
  `lib/pleroma/web/endpoint.ex`,
  `lib/pleroma/web/templates/o_auth/o_auth/show.html.eex`,
  `lib/pleroma/web/templates/o_auth/o_auth/_scopes.html.eex`,
  `priv/static/static-fe/forms.css`,
  `lib/pleroma/web/plugs/o_auth_scopes_plug.ex`,
  `lib/pleroma/web/o_auth/o_auth_view.ex`
