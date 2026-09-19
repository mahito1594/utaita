# 0015: Sign-in gates only the personal surfaces; visibility is the server's call

- Status: draft
- Date: 2026-09-16

## Context

Until this record, every route sat under one login gate: an unauthenticated
visit to any URL rendered the login screen in place (App.tsx, `AuthGate`).
The gate was never decided; it was the shape the OAuth session
(ADR-0003) left behind, and the deep-link return leg (stories, 2026-08-09)
was built on top of it so that a shared thread URL survived a sign-in.

Running the frontend on the reference instance made the cost visible: a
thread or profile link shared with someone who has no account on the
instance — or who is not signed in on this browser — shows a login screen
for a post that is public.

The server does not require this. Akkoma (with the default
`instance.public: true`) answers anonymous requests for public and unlisted
statuses, their `/context`, accounts, account statuses, follow lists, and
the who-lists with 200; a private or direct status answers 404, not 401
(`Visibility.visible_for_user?/2` with a nil user). Measured against the
reference instance on 2026-09-16 (see PLAN, Akkoma pitfalls). akkoma-fe
renders `/notice/:id` without a login guard; Mastodon serves public posts
and profiles to anonymous visitors by default; Misskey has no setting to
stop it. With `instance.public: false`, Akkoma answers anonymous `/context`
with a blanket 403 and the page falls into the existing sign-in branch.

## Decision

- **The sign-in gate wraps only the personal surfaces**: the timeline routes
  (`/`, `/local`, `/bubble`, `/federated`). Shareable URLs — threads, the
  who-lists under them, and profiles — render for anonymous visitors and
  fetch anonymously. "Anonymously" rests on the API client sending no
  cookies (`credentials: "omit"`): Akkoma also authenticates a header-less
  request by the session cookie it set from an earlier Bearer token.
- **Visibility is decided by the server's answer, not by the client.** The
  pages do not inspect `visibility`, `restrict_unauthenticated`, or the
  instance's `public` flag. A 401 or 403 is a sign-in prompt; a 404 while
  signed out is "not on this instance, or needs a sign-in to see", with the
  same prompt; a 404 while signed in is simply not found.
- The gate stays a layout route rendered in place at the opened URL — there
  is no `/login` URL — and the header carries a "Log in" button for anonymous
  visitors, so the return leg after sign-in keeps working from any page.
- **Logging out is a data boundary: it reloads the document.** Without a
  gate in front of them, the ungated pages stay mounted across a logout, and
  so would whatever they fetched with the token — a followers-only thread, a
  locked account's posts. Clearing each cache by hand has to be remembered
  for every future one; a reload of the current URL drops them all and
  re-fetches the page anonymously. The header's button does the reload;
  `logout()` itself only clears the session.
- **A sign-in this tab started wins over a token already stored.** The
  callback exchanges the `code` whenever this tab holds the pending `state`,
  even if a token is present, because that token may be the expired one the
  user is signing in to replace: a 401 does not clear the stored token, so
  short-circuiting on it would leave "Log in" unable to sign anyone in. A
  callback URL revisited without a pending `state` (history,
  a bookmark, a sign-in finished in another tab) still lands without an
  exchange.
- Not included: anonymous access to the public timelines. Akkoma serves
  them, but a shareable link is a post or a person, not a feed; opening the
  feeds is a separate story if it is ever wanted.

## Consequences

- Every new route must decide which side of the gate it belongs on. The
  test is whether the URL is something a reader would hand to someone else.
- Anonymous requests to endpoints that need a user (`verify_credentials`,
  `/accounts/relationships`) answer 403; nothing in the read paths calls
  them, and a future write path must not be reached from an ungated page
  without its own sign-in check.
- A route `preload` runs regardless of the gate (ADR-0014 noted that a
  signed-out thread visit already fetched anonymously); the gate was never
  a fetch boundary and is not relied on as one.
- The instance operator's settings, not this frontend, decide what an
  anonymous visitor can read. A frontend-side veil would only disagree with
  them.

## References

- [ADR-0003](./0003-oauth.md) — the session the gate grew out of
- [ADR-0014](./0014-thread-view.md) — the preload note that first recorded
  anonymous fetching
- [PLAN.ja.md](../PLAN.ja.md), Akkoma pitfalls — anonymous answers per
  endpoint and visibility
