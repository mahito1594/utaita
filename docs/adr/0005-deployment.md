# 0005: Staged rollout via `preferred_frontend`

- Status: accepted
- Date: 2026-07-04

## Context

Akkoma serves frontends from `$instance_static/frontends/<name>/<ref>` and
selects the default via `config :pleroma, :frontends, primary:`. Installation
is either manual file placement or `pleroma_ctl frontend install <name>
--file <zip>`. Additionally, Akkoma lets each user pick their own frontend at
`/api/v1/akkoma/preferred_frontend`, so multiple frontends can coexist.

## Decision

Release as a zip laid out for `frontends/utaita/<ref>`. Roll out in stages:
install alongside pleroma-fe, switch only the developer's own account via
`preferred_frontend`, and promote to `primary` only after daily use holds up.
CI builds the release artifact.

## Consequences

- Dogfooding happens in production with zero risk to other users of the
  instance; rollback is switching `preferred_frontend` back.
- The artifact must be fully static and relative to its mount point — no
  server-side rendering, no absolute asset paths outside the frontend dir.

## References

- https://docs.akkoma.dev/stable/configuration/frontend_management/
- https://docs.akkoma.dev/stable/administration/CLI_tasks/frontend/
- https://docs.akkoma.dev/stable/development/API/akkoma_api/
