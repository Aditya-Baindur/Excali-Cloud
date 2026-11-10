# Build record: local brainwriting (2026-11-05)

- **Spec and done bar:** ../superpowers/specs/2026-11-05-local-brainwriting.md
- **Owner:** Codex main session · **Status:** in progress
- **Base:** 517af8d, clean night-crew branch
- **Timing/usage:** tool durations available; active human time and billing unknown.

## Delegation
| Task | Who | Requested model/effort | Actual | Outcome |
|---|---|---|---|---|
| Architecture, integration, implementation | Main session | inherited | session model | in progress |

## Log
### 2026-11-05
- [DECISION] User explicitly asked to plan then build; proceed through the documented local design without another approval round. No cloud deployment or push. Evidence: chat request.
- [DECISION] Add a local runtime alongside Aditya's existing app because its Clerk/Cloudflare bootstrap cannot provide credential-free local use. Evidence: frontend/src/app/layout.tsx and wrangler.jsonc.
- [DECISION] Adopt Excalidraw version/nonce conflict order and file format; add board-scoped invites and atomic persistence. Evidence: spec sources and existing frontend board wrapper.
- [DIFFICULTY] npm metadata lookups inside sandbox stalled; approved network execution returned dependency versions. REA requires newer Node than installed, so use a temporary compatible Node package rather than alter the machine runtime.

## Close
- Result: implementation in progress.
- Open: real MCP/browser verification, independent review, teammate network access (not locally provable).

## Completion checkpoint
- [DELEGATION] `/root/test_contract` owned only `local/test/server.test.mjs` and `local/test/mcp.test.mjs`; requested gpt-6-luna/medium under the build guideline. Done bar: real SDK client and live observer, auth scopes, concurrency and restart. Delivered acceptance tests; main session integrated fixes. Actual billing/tokens unknown.
- [DELEGATION] `/root/review_local` reviewed server, UI and MCP read-only with the session model. Done bar: evidence-backed correctness findings. Found insecure-context UUID use and unsaved field loss on panel changes. Both fixed, with browser regressions. Review used exact code locations before edits.
- [DECISION] User added private generation, explicit Diverge/Converge phases, Crazy 8s and selected-area AI expansion during implementation. Added reversible phases, three-vote convergence, local private drafts and the action label “Diverge thinking.” The action prepares a request for an existing MCP chat; it never fabricates an AI reply.
- [DIFFICULTY] Browser acceptance exposed phase updates racing canvas revisions. Serialized active saves and retry a metadata change only when its targeted fields remain unchanged in the new revision. Also snapshot file patches before sending so later image edits remain pending.
- [DIFFICULTY] The native editor has static and interactive canvas layers. The initial browser test targeted the static layer and waited on intercepted clicks. Targeting the interactive layer verified actual mouse drawing, selection and save.
- [EVIDENCE] Final `npm test` in `local/`: 12/12 passed; includes persistence failure, tombstones, import assets/discussion, actual SDK client/observer and bound-label movement. TypeScript check passed. Existing repository `npm test`: 6/6 passed.
- [EVIDENCE] `npm run test:browser`: 2/2 passed on installed Chrome. Checked mouse-drawn shapes, browser draft persistence and privacy, reveal, two-browser phases, selection focus, backup import, mobile layout and actual private-IP guest notes/discussion. Desktop/mobile screenshots inspected in ignored `local/.tmp/`.
- [EVIDENCE] Separate stdio MCP client initialized the real process, discovered 11 tools, created the first Night Crew vision board and read it back. Project configuration generated locally; this chat has not dynamically loaded that server.
- [EVIDENCE] Production Vite build passed. Upstream browser package emitted “use client” bundler warnings; this app runs client-side. REA analyzed the public Miro template: 33 sources captured, 32 parsed; partial result due to one script deadline. Details and unknowns: `docs/research/miro-brainwriting-rea.md`.
- [NUMBERS] Final browser run reported 3.8 seconds; final local Node suite reported about 0.76 seconds; root suite about 0.89 seconds. These are individual verification commands, not total build time. Total active time, token usage and billed cost are unknown.
- [HANDOFF] Local app verified at `http://127.0.0.1:4318`; launcher and local guide provided. No public deployment, tunnel, automatic Git sync or upstream push. Actual teammate hardware/internet routing remains untested; a private-IP browser on this host was tested.
- [HANDOFF] Next review gate before upstream sharing: user-invoked `/codex:adversarial-review`. Next-build experiment: run a full user journey through the interactive editor before polishing surrounding controls; verify it catches integration races earlier. Owner: next canvas build.

- [DECISION] Voting features are deferred. The team votes out loud for now, and the existing three-vote feature stays unchanged. Hidden votes, Adopt before voting, the AI-drafted matrix and a named decider are kept in `docs/future-plan.md`, along with the trigger that brings them back. Evidence: user request in chat, 2026-11-05.
- [DECISION] Crazy 8s removed entirely at the user's request: the timer, the eight-slot button, `session.deadline` in store and MCP, and its CSS. Imports copy only known session fields, so older backups that carry a deadline still load.
- [DIFFICULTY] Code review findings fixed: (1) the AI's board reads included full base64 images, so `read_board` and the brainstorm prompt now list only image IDs and types; (2) MCP edits used `versionNonce: 0`, which always won ties against human edits, so they now use a random nonce; (3) every save broadcast all images, so each socket now gets an image once and patch/vote responses carry no image data, with the client keeping files from earlier updates; (4) IPv6 LAN addresses never matched the Host check because of missing brackets; (5) a malformed URL returned a misleading 500 and now returns 404; (6) the launcher trusted a PID that Windows can reuse, so it now checks whether the workspace actually answers; (7) the launcher skipped `npm ci` after a lockfile change. Privacy scrub for the public repo: removed a name and a private path.
- [EVIDENCE] `npm test` in `local/`: 15/15 passed, including 3 new regression tests (image sent once, image data left out of patch responses and AI reads, random nonces, malformed URL is 404). Type check passed and `npm run build` passed. `npm run test:browser`: 7/7 passed.
- [DECISION] Diverge and Converge are now two actions on the selection, in the toolbar and the right-click menu, replacing the side-panel phase tabs (the user picked option B over a top-bar switch or canvas zones). Each action still sets `session.phase`, so the AI's phase-specific rules, the vote box and the decision field keep working. An Exploring / Converging label beside the board name shows the phase to everyone, with "Back to exploring". Known cost: with no board-wide gate, one person can converge while others still explore; the team handles that out loud.
- [EVIDENCE] `npm test`: 15/15. Build passed. `npm run test:browser`: 7/7, including Converge from the toolbar across two browsers, Converge from the right-click menu, and no tabs left. The first run failed because a test clicked under Excalidraw's text-style panel; the test now selects with the keyboard.

Completion status: implemented and locally verified. Awaiting user use and upstream collaborator access; neither is claimed complete.
