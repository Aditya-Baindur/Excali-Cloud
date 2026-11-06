# Night Crew local workspace

Open **Start Night Crew.cmd** from the repository root. It installs dependencies on the first run, builds the app, and opens your browser. Node.js 24 or newer is required. Keep its terminal running while using the workspace. Close it with Ctrl+C.

For a terminal start, run these from the repository root:

```powershell
npm run local:install
npm run local:build
npm run local:mcp:setup
npm run local:start
```

Open <http://127.0.0.1:4318>. No Clerk or Cloudflare account is needed for local mode. The existing cloud app has its own setup in the main README.

## Brainstorm together

Create a Brainwriting board. In **Diverge**, each person can write in Private drafts, then reveal when ready. Drafts stay in that browser’s local storage until reveal; clearing browser storage removes them. Crazy 8s offers eight private slots and a shared eight-minute timer. You can also draw freely with Excalidraw. Problem framing and decision criteria are left to the team; they have no dedicated form fields.

Right-click the canvas and choose **Add sticky note** to place an idea where you clicked, including on Brainwriting boards. You can also use the **Sticky note** icon in the drawing toolbar beside the shape tools to place one at the center of your current view. Write the idea and choose **Add sticky note**. Stickies start at 240 × 200 canvas units regardless of zoom. Longer text grows them in both directions, keeping them close to square. You can resize them manually; editing respects that size as the minimum. Newly typed free text retains its zoom-aware sizing. The **− / +** controls change zoom without a percentage display.

Right-click an idea or a selection and choose **Diverge thinking** in the drawing menu. The toolbar has the same action. It saves the selection as the board’s focus, switches to Diverge, and copies a request for your MCP-connected AI chat. Paste that request into the chat. Your AI can read the board, expand alternatives beside the originals, connect systems, and post its explanation in Shared discussion. No model or automatic AI response runs inside the webpage.

Switch to **Converge** when ready to compare. Select shapes to place up to three votes per browser session, and record the decision and next test. Votes help discussion; they are not an identity-verified election. Returning to Diverge keeps all ideas and votes. AI instructions change with the phase.

## Connect your AI through MCP

The launcher creates `.codex/config.toml` for this checkout if that file is absent. Open this repository as a trusted project and restart/reopen your AI client to load its server. It is named **night-crew**. The running chat does not automatically gain a newly configured server.

The setup follows the [official Codex MCP configuration documentation](https://developers.openai.com/codex/mcp). For another stdio MCP client, use `mcp-config.example.json`, replacing the absolute path with your checkout path. The executable is `node` and its argument is the absolute path to `local/server/mcp.mjs`. Keep the local app running. The bridge reads this checkout’s ignored `local/.env`; do not paste its key into client configuration or chat.

Try: “Use night-crew to read my board. Help me explore the selected idea and map the architecture beside it.” The tools can list/create/read boards, add shapes and notes, connect or update elements, write the brief, post discussion, and update the session/focus. Tools require the latest revision for edits that could overwrite existing content. The `brainstorm` MCP prompt adapts to the saved phase.

## Invite the team

For a shared session, stop the app, change `WORKSPACE_HOST=127.0.0.1` to `WORKSPACE_HOST=0.0.0.0` in `local/.env`, and restart. Open the app locally, click **Share**, and replace `127.0.0.1` in the invitation with the host computer’s private network IPv4 address (shown by `ipconfig`). Teammates open that invitation in their browsers. An invitation allows editing only its board.

The host must be running and reachable on the same private network or your existing private VPN. Windows may need permission for Node on private networks. No router port forwarding or public tunnel is configured. LAN transport is HTTP, intended for a trusted private network. Return the host setting to `127.0.0.1` for local-only use. Changing the owner key signs everyone out and invalidates all invitation links.

## Keep and move your work

Accepted edits are saved as JSON in `local/data/`, including canvas images, session, votes and discussion. Both this directory and `local/.env` are gitignored. Back up the data directory while the app is stopped. Keep the `.env` private; restoring it preserves invitation signatures.

**Export** saves a native `.excalidraw` drawing with its images. **Download full backup with discussion** also carries the brief, phases, votes, focus and messages. **Import a board or backup** opens either as a new board. Put an exported copy in your shared folder or GitHub so teammates can download and import it while your computer is off. Check that it contains nothing private before publishing it.

A shared file or Git repository carries snapshots; simultaneous editing uses the running app. Use a separate data directory for every host, and sync exported snapshots. Importing another person’s snapshot creates a separate board.

## Development and limits

From `local/`: `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser`. Browser tests use installed Google Chrome and temporary board directories, including a private-IP guest check when a network interface is available.

This first version merges edits per Excalidraw element. Separate notes merge; concurrent changes to the same shape use native version/nonce ordering. It does not merge characters inside the same text element or show live cursors. Unsaved canvas changes retry while the page stays open; a reload warning protects pending changes, but there is no durable offline edit queue. Save before closing. Board/request size is limited to 25 MB; export and split large boards. Invite editing is shared access, without per-person accounts or per-link revocation.

The public Miro inspection and its limits are documented in [the REA notes](../docs/research/miro-brainwriting-rea.md).
