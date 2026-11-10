# Local Brainwriting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a local persistent Excalidraw workspace with live human collaboration and MCP access.
**Architecture:** An additive local app in this repository. A Node service persists and merges per-element patches; React renders the existing Excalidraw package; a stdio MCP bridge calls the same authenticated service.
**Tech Stack:** Node 24, React, Vite, Excalidraw 0.18.1, ws, official MCP SDK, Zod, Node test runner.
**Spec:** `../specs/2026-11-05-local-brainwriting.md`.

## Global constraints
- Local files and `.env` ignored by git; no external AI calls, deployment or push.
- Keep existing Cloudflare app functional; isolate dependencies in `local/package.json`.
- Persist before ack; retain tombstones; bound requests and validate paths.
- MCP and browser use the same board service; board invites are scoped.
- Shared brief text is human-facing; use plain language.

## Review focus
- A disconnected client resubmits stale edits after another user deleted an element.
- An invite to one board is used against another board or owner-only endpoints.
- An invalid file or failed disk write must not replace valid state.
- AI edits race with an active human session or use an outdated revision.
- Import/export retains image files and discussion; reconnect doesn't duplicate messages.

### Task 1: Durable board model
**Files:** create `local/server/store.mjs`, `local/shared/scene.mjs`, `local/test/store.test.mjs`, local package/config.
**Interfaces:** `BoardStore({directory,write?})`: `list()`, `create({name,template?})`, `read(id)`, `patch(id,{elements?,files?,background?,brief?,message?,expectedRevision?})`; board `{id,name,revision,elements,files,background,brief,messages,updatedAt}`. Store methods synchronous, persisted before return. Export `makeElements(items)` and `brainwritingElements()` from shared scene module.
- [x] Write/run failing tests for independent concurrent edits, native conflict resolution, tombstone replay, stale revisions, message idempotency, restart, invalid paths and disk failure.
- [x] Implement bounded validation, deterministic merging and atomic file writes.
- [x] Run `node --test local/test/store.test.mjs`; expected all pass.

### Task 2: Authenticated local runtime
**Files:** `local/server/app.mjs`, `local/server/start.mjs`, `local/test/server.test.mjs`.
**Interfaces:** `createWorkspaceServer({directory,ownerKey,host?,port?,staticDirectory?})` returns `{server,store,listen(),close()}`. REST `/api/session`, `/api/boards`, `/api/boards/:id`, `/api/boards/:id/invite`, `/api/boards/:id/patch`; WebSocket `/live/:id`. Bearer owner auth or same-origin cookie. Invite is HMAC scoped to board. Authenticated WS sends full board after connection and every accepted change; clients post patches over HTTP. Shared cookie name distinct per port.
- [x] Write/run failing auth/live-sync tests, including cross-origin, scope, two-client persistence and restart.
- [x] Implement server, static production app serving and Vite development integration.
- [x] Run `node --test local/test/server.test.mjs`; expected all pass.

### Task 3: MCP bridge and AI contract
**Files:** `local/server/mcp.mjs`, `local/test/mcp.test.mjs`, `local/README.md`.
**Interfaces:** `createMcpServer({baseUrl,ownerKey})`; tools `list_boards`, `create_board`, `read_board`, `add_elements`, `connect_elements`, `update_elements`, `write_brief`, `post_message`; prompt `brainstorm`. `mcp.mjs` CLI accepts `--url` and loads ignored `.env`. Shapes use Excalidraw IDs, coordinates, text, metadata and deletion/version fields. Updates require `expectedRevision`; adds merge safely.
- [x] Have a bounded test-writer prepare a real SDK client acceptance test, then observe its failure.
- [x] Implement bridge using official SDK; stdout reserved for MCP transport.
- [x] Test with SDK client and WebSocket observer; expected identical board state, stale update rejected.

### Task 4: Local visual workspace
**Files:** `local/src/App.tsx`, `local/src/collaboration.ts`, `local/src/styles.css`, `local/index.html`, `local/vite.config.mjs`, local scripts and root launch script.
**Interfaces:** UI reads server boards; `onChange` diffs elements against latest rendered version and sends only changed elements and files; applying remote state preserves viewport and active selection. Use native Excalidraw restoration/export helpers, tombstones and native conflict order. Retain pending patches while reconnecting and retry safely. Brief saves explicitly; discussion uses UUID message IDs. UI never sends owner keys to guests.
- [x] Implement board list/new/open, blank/brainwriting templates, add-note form, shared brief/discussion, connection state, invite copy, import/export and MCP setup instructions.
- [x] Build `npm --prefix local run build`; start `npm --prefix local start`.
- [x] Use browser checks for drawing, two pages syncing, persisted reopening, import/export and mobile panel controls.

### Task 5: Integrate, review, handoff
**Files:** tests, README, build record, `.gitattributes`, root package scripts; review may touch all feature files.
- [x] Run root tests and all local tests/build/typecheck.
- [x] Independent reviewer reads spec/diff with security, persistence and human/AI races as priorities; fix supported findings and rerun checks.
- [x] Document exact Windows startup and MCP configuration, private-network prerequisites and known limits.
- [x] Verify final status/diff and keep the app running for the user. No upstream push or merge.
