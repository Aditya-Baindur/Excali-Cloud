# Future plan

Ideas agreed on but not built yet. Each one says why it's waiting.

## AI thinking partner (agreed 2026-11-05, not built)

- **A two-move Diverge instruction.** Add one sentence to the Diverge rule in `local/server/mcp.mjs`: *"For each focused idea, include a "10x:" branch (ten times better on the brief's problem, not 10% better) and a "Weak point:" branch (where it most likely breaks, plus one concrete fix). Beyond those two, explore however you judge best."* Keep it minimal so the AI stays free to be creative.
- **AI clustering when Converge starts.** The AI groups similar notes, draws a labeled frame around each group and merges duplicates, without deleting anything. The tools to draw frames already exist, so this is mostly prompt work.
- **A "How might we…" line in the brief.** Before anyone writes, the AI asks what problem the team is solving and what they want to have happen, then writes the answer as one "How might we…" line at the top of the brief. Every Diverge pass reads it.

**Order when picked up:** the Diverge instruction first (one line plus a test), then clustering, then the brief line.

## Voting (deferred 2026-11-05)

**For now the team votes out loud.** The three-vote feature that already exists stays as it is. Nothing new gets built for voting until spoken voting stops being enough.

When it comes back:
- **Hidden votes until everyone has voted.** Each idea shows its vote total today, so whoever votes second sees the first person's picks. Hide the counts, add a "Reveal votes" button, then show the heat map. This is the Note-and-Vote pattern from Google Ventures sprints.
- **AI notes need a human "Adopt" first.** An AI-written note can't receive votes until a person adopts it, so the AI can't win by producing more notes than anyone else.
- **A decision matrix the AI drafts.** After voting, the AI places the top groups on an impact-versus-effort grid as a first draft, and people move them.
- **A named decider.** The board records who makes the final call and what they chose, which is the last step of a Google Ventures sprint.

**Bring it back when:** voting out loud stops working, for example when someone joins remotely or the board has too many ideas to talk through.
