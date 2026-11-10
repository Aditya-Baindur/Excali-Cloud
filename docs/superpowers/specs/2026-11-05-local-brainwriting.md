# Local collaborative brainwriting

## Intent and authorization
The user asked to plan then build on the existing `night-crew` branch. Build a usable local visual thinking partner for Night Crew: humans and an existing MCP-capable AI develop features, systems and architecture together. No separate AI subscription, public deployment, fork or upstream push is authorized or needed.

## Ground
- Baseline: `517af8d`; clean `night-crew` branch, Node 24.18.0, npm 11.16.0 verified from the tools.
- Existing cloud app requires Clerk and Cloudflare. Its canvas wrapper exposes local scene import/export and saves snapshots; public shares set `viewModeEnabled`.
- Miro public template: https://miro.com/templates/brainwriting-template-ai/ describes quiet idea generation, building on ideas and AI-assisted organization. The authenticated Miro implementation is not available as source.
- Adopt Excalidraw's version/nonce conflict order: higher version wins; at equal version, lower nonce wins. Keep deletion tombstones. Source: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/reconcile.ts.
- Reject a second cloud account stack for local use and folder/git synchronization as a live collaboration transport. Existing Excalidraw MCP implementations establish prior art, but do not by themselves supply this project's saved shared boards.

## Design
Add `local/`, a standalone local entry point in the same repository using the existing Excalidraw editor dependency and scene format. A small Node HTTP/WebSocket service owns files and broadcasts versioned per-element edits. Existing cloud deployment stays usable. Reuse the upstream import/export format and canvas, rather than fork Excalidraw itself.

Browser layout: board list on the left, Excalidraw in the center, collapsible thinking brief on the right. Brief holds the vision, shared conversation, prompts, and clear AI connection instructions. Brainwriting creates three round areas (write ideas, build on them, map the system), plus questions/decisions. The AI works through the user's existing MCP client; the UI must never pretend a canned response came from a model.

Server defaults to loopback. Optional LAN binding supports simultaneous remote clients on a reachable private network. Owner capability is generated into ignored `local/.env`; board-scoped invitation capability cannot list or edit other boards. Share links carry the invitation in a URL fragment; browser exchanges it for an HttpOnly session cookie. Origins and Host are validated; no wildcard CORS. The MCP stdio bridge uses the owner key from `.env`, not a browser-exposed secret.

Persist every accepted change atomically before acknowledging it. Scenes include elements, files, background and shared discussion. Disk failures leave the in-memory state unchanged and show an error. Reconnect resends pending versioned edits; replay is idempotent. Same-element conflicts follow the native Excalidraw rule, not character-level text merging. Do not imply automatic offline branch merging.

MCP: list/create/read boards; add notes or architecture shapes; connect nodes; update/delete elements with expected board revision; read/write the thinking brief and append discussion; provide a brainstorming prompt that reads the board and asks questions before proposing changes. AI uses explicit tools; no paid model calls in tests.

Local exports are editable `.excalidraw` snapshots plus a full JSON workspace backup containing brief/discussion. GitHub or shared-folder copies are manual snapshots; concurrent file sync is not the live transport. No automatic GitHub writes.

## Done bar
1. One documented command starts a local app without Clerk/Cloudflare credentials; opening and reopening saved boards works.
2. Two clients edit different elements concurrently without losing changes, deletions stay deleted, retries do not duplicate changes, restart restores accepted state.
3. A real SDK MCP client lists tools, reads a board, adds a note, connects nodes and sees the result through the same live WebSocket state. Stale destructive updates are rejected.
4. Brainwriting areas, shared brief/discussion and AI prompt are usable; imported/exported files preserve elements and embedded assets.
5. Authentication, board-scoped sharing, rejected cross-origin requests, invalid IDs/payloads and persistence failures have behavioral tests.
6. Build, tests and actual browser desktop/mobile checks pass. Existing root tests still pass. No claim of internet/team access unless separately tested.

## Boundaries
No autonomous built-in model, Miro backend extraction, public hosting, automatic tunnel, GitHub sync or video-editor modifications. Team remote use requires a reachable host; OS firewall and network routing are external prerequisites. User explicitly selected branch name `night-crew`.

## Visual choices
Retain Excalidraw's drawing experience. Surrounding chrome uses white/slate with a restrained violet accent, system typography, a compact board navigator and a readable brief. No unrelated personal brand palette. Keep controls keyboard accessible and collapse panels on small screens.
