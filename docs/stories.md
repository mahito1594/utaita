# User stories

Format: one line per story, with acceptance criteria only where they are not
obvious. Stories are grouped by phase; unscheduled ideas go to the icebox.

> Status: initial draft seeded from the roadmap. To be curated against real
> frustrations with pleroma-fe — observe actual usage and rewrite.

## Phase 0 — Foundation

Instead of user stories, a single vertical slice serves as the done condition:

- [x] Fetch a timeline from the reference instance through the dev proxy with
      the generated typed client and render it as a list of status cards
      inside the (rough) app shell. The dev token is injected from env; when
      it is unset, a handled 401/403 (differs per endpoint — see the pitfalls
      in PLAN.md) surfaces in the UI. (Verified 2026-07-06: the 200 path in a
      real browser, the 401/403 path via the page test plus a raw fetch
      against the instance.)

## Phase 1 — Read-only MVP

- [ ] As a user I can log in with my instance account and stay logged in
      across browser restarts.
- [ ] I can read my home timeline with smooth infinite scroll; opening a CW
      does not shift my scroll position.
- [ ] I can switch between home / local / bubble / federated timelines and
      each remembers its scroll position during the session.
- [ ] I can see who boosted a post and what emoji reactions it has, including
      custom emoji rendered inline.
- [ ] I can open a post and read the full conversation tree without losing
      track of which post I came from.
- [ ] I can view a profile with its posts, replies, and media tabs.
- [ ] I can read my notifications and tell mentions, boosts, follows, and
      emoji reactions apart at a glance.
- [ ] I can use the app comfortably on a phone (in-hand reachability, no
      horizontal overflow) and on a desktop.

## Phase 2 — Writing

- [ ] I can write a post with CW and visibility (including `local`), with
      custom emoji autocomplete.
- [ ] I can attach images with alt text and see upload progress.
- [ ] I can favourite, boost, bookmark, and emoji-react from the timeline.
- [ ] I can follow/unfollow from a profile and see pending state for locked
      accounts.
- [ ] I can search for accounts, hashtags, and posts.

## Icebox

- Catch-up digest for missed posts (Phanpy-style)
- Drafts that survive a closed tab
- Realtime timeline updates via streaming
- Multiple accounts
