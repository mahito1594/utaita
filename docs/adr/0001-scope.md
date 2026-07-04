# 0001: Instance-served generic Akkoma frontend, read-only-first MVP

- Status: accepted
- Date: 2026-07-04

## Context

The project started from dissatisfaction with pleroma-fe on a self-hosted
Akkoma instance. Two distribution models exist for Fediverse web clients:
standalone hosted apps that connect to arbitrary instances (Elk, Phanpy), and
frontends served by the instance itself via Akkoma's frontends mechanism
(pleroma-fe). The project should be publishable for other Akkoma admins, not
tied to one instance.

## Decision

- Target: a generic Akkoma frontend distributed as static files and installed
  through Akkoma's frontends mechanism. The API origin is always
  `window.location.origin`; no instance picker, no hardcoded instance URLs.
- ringed.space is the reference instance for development and dogfooding only.
- MVP is read-only (login, timelines, threads, profiles, notifications);
  writing comes in a second phase. This gets a daily-usable artifact sooner
  and front-loads the design work.
- Standalone hosting with an instance picker is out of scope for now; nothing
  should actively preclude it later.

## Consequences

- No dynamic instance discovery or multi-instance compatibility matrix in the
  client; the supported Akkoma version range must be documented instead.
- CORS is a development-time concern only (Vite proxy); production is
  same-origin by construction.
- Akkoma-specific extensions (emoji reactions, bubble timeline, `local`
  visibility) can be used freely — Mastodon-server compatibility is a non-goal.

## References

- https://docs.akkoma.dev/stable/configuration/frontend_management/
