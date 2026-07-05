# Process

Lightweight by design: three checklists and a session ritual. If a step stops
paying for itself, delete it.

## Phase lifecycle

### Kickoff

- [ ] Curate the phase's stories in [stories.md](./stories.md); define the
      phase's done condition
- [ ] Decide which screens need a rough wireframe (only those touched by this
      phase; export to `docs/design/`)
- [ ] Poke the relevant API endpoints with curl and read the raw JSON before
      writing typed code
- [ ] Record any open design questions as ADR drafts

### Iteration (one session ≈ one story)

- [ ] Pick one story; state it at the start of the session
- [ ] Discuss approach before code when the story touches new ground
- [ ] Implement, review, commit (commit messages carry the "why")

### Wrap-up

- [ ] Check the phase's done condition against stories.md
- [ ] Retrospective: what worked, what to change in this file
- [ ] Promote decisions worth keeping into ADRs
- [ ] Sync `.ja.md` sources to their English `.md` counterparts
- [ ] Check that the root `CLAUDE.md` still matches reality (commands, docs
      pointers, agreements)
- [ ] Write up learnings as a blog post (link indexed privately, not in-repo)
- [ ] Update the current-status section of [PLAN.md](./PLAN.md)

## Working agreements

- Rule of three: write it concretely first; extract a shared abstraction only
  when the third occurrence appears. Duplication is cheaper than the wrong
  abstraction. (Panda recipes follow the same rule — see
  [design/](./design/README.md).)
- Exception — duplicated knowledge is centralized from day one: API shapes
  (generated types from `openapi.json`), design tokens, auth header
  injection. Divergence there is a bug, not tolerable duplication.

## Language convention

Living documents where discussion happens (PLAN, stories) are bilingual: the
Japanese `.ja.md` file is the source of truth, and the English `.md` is synced
from it at phase boundaries (wrap-up checklist). Stable records (ADRs, this
file, READMEs) are English-only; discussion happens in chat, only the outcome
is recorded.

## Where things get written down

| Kind | Place |
| --- | --- |
| Decisions with lasting consequences | [adr/](./adr/) |
| Backlog and acceptance criteria | [stories.md](./stories.md) |
| Design tokens and wireframes | [design/](./design/) |
| Learning narratives | Personal blog (indexed in `CLAUDE.local.md`, untracked) |
| Rationale for a specific change | Commit message |
