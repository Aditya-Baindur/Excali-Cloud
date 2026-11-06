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

Completion status: implemented and locally verified. Awaiting user use and upstream collaborator access; neither is claimed complete.
