# Miro brainwriting inspection

Inspected the public [AI Accelerated Brainwriting template](https://miro.com/templates/brainwriting-template-ai/) using [REA](https://github.com/morluto/rea), running `rea-agents@6.8.0` under a temporary `node@24.22.1`. A separate headless Chrome tab exposed a loopback CDP endpoint; no personal browser profile or authenticated Miro session was used.

REA `analyze-web-bundle` ran with a 500 ms observation window, a 10-second per-script deadline and a 45-second total analysis deadline. Its evidence identifier was `ev_0f1e80de81418d3093c126e173d4595ebbec4ab56dd3d317b2c1febe59152e7a`. It captured 33 script sources, parsed 32 with zero parse failures, and explicitly reported partial completeness because one script reached its analysis deadline. The route inventory identified Next.js public template assets and a public view-only embedded board. Low-confidence endpoint candidates were not treated as verified APIs.

This establishes public-page structure, not Miro’s authenticated AI implementation, model prompts, or collaboration backend. Those remain unknown. No private endpoint or proprietary AI logic was copied. This implementation reproduces the useful interaction pattern using Excalidraw and an independent local service.

## Adopt

- Quiet individual writing before reveal, then building on visible ideas. The public template describes independent generation and AI-assisted organization/expansion.
- A selected canvas area as explicit AI context, with new alternatives beside preserved originals. This is our design choice for the user’s requested interaction.
- [Crazy 8s](https://designsprintkit.withgoogle.com/methodology/phase3-sketch/crazy-8s): eight quick ideas/sketches in eight minutes. Timer and slots are optional.
- Excalidraw’s native scene import/export and version/nonce conflict ordering. Its MIT-licensed editor is already used by this repository.

## Reject

- Depending on undocumented Miro AI endpoints: neither stable nor needed for local ownership and MCP access.
- Treating a shared JSON file as a realtime collaboration server: snapshots alone cannot coordinate live edits.
- Building a new drawing engine: Excalidraw supplies selection, shapes, connections, native files and rendering.
- Selecting a winner during divergence: exploration and evaluation have separate phase instructions.

## Competitive meaning

Miro already offers the hosted template workflow. Our useful difference is local saved files, the existing Night Crew canvas foundation, and control through an MCP-connected AI chat. This first version requires a running host for shared editing and an external AI client for generation.

The cited [Nature study on virtual communication](https://www.nature.com/articles/s41586-022-04643-y) concerns idea-generation effects of videoconferencing; it does not establish that every remote or asynchronous workflow is worse. The tool supports quiet preparation and in-person sessions as well as remote use.
