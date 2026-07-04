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
  least privilege on the token matters: a leaked Phase 1 token can read but
  not post. Phase 2 costs exactly one re-authorization prompt.
- Client credentials in `localStorage` are readable by any script on the
  origin; without PKCE this is the ceiling of what a browser-only public
  client can do, and it matches established practice (Elk, Phanpy,
  pleroma-fe). XSS hardening (sanitization, CSP) is the real defense.
- Because the app is served by the instance, registration happens exactly
  once per instance — no instance-selection or multi-registration logic.
- If Akkoma gains PKCE upstream, adopt it and supersede this ADR.

## References

- Akkoma `develop` branch, source-verified 2026-07 via akkoma.dev raw files:
  `lib/pleroma/web/o_auth/o_auth_controller.ex`,
  `lib/pleroma/web/o_auth/token.ex`,
  `lib/pleroma/web/mastodon_api/controllers/app_controller.ex`,
  `lib/pleroma/web/router.ex`, `config/config.exs` (`:oauth2` section)
- https://docs.akkoma.dev/stable/development/authentication_authorization/
