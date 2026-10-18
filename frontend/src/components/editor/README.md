# Video editor

`/editor` selects a board. `/editor?boardId=…` opens that board's draft;
`/editor?boardId=…&videoId=…` edits a library video. Clerk protects the route.

The black workspace has a collapsible media browser and inspector, a preview,
and a multi-track timeline. Media, audio, titles, transitions, looks, and
backgrounds are available from the library. The toolbar provides split,
duplicate, delete/ripple delete, trim to playhead, close gaps, grouping,
audio detachment, and microphone voiceover. The inspector provides clip
source ranges, speed/reverse, transform/PiP, title styling, audio gain/fades,
color, transitions, and the native advanced/keyframe controls.

- Pick multiple files, drop, or paste media. Videos upload to the board API;
  images/audio remain local. Every import uses its actual media duration.
- SRT/VTT imports create editable caption tracks. A renderer registry adapter
  makes cues follow source time when captions move, trim, split, or reverse.
- Export offers project size, 720p, 1080p, or 4K, frame rate and quality. Pixel
  properties scale with export resolution. Rendered MP4s can be downloaded or
  saved as a new board video; originals are preserved. Board uploads have a
  50 MB limit. Export codec support and speed depend on the browser/device.
- Drafts autosave in IndexedDB per user, board, and source video, with local
  image/audio blobs. They are browser-local, not cloud-synced. Navigation
  flushes saves; failed saves block in-app board switching.
- Project backups embed local media and preserve the complete editing document.
  Board video references still require access to the original board. Open project
  is undoable; assets referenced by undo history stay alive until session exit.
- No Worker routes, migrations, board scenes, or sharing permissions change.

The `tests/editor-*.test.ts` and `tests/video-editor.test.ts` suites cover edit
semantics, nested source timing, upload contracts, draft isolation, caption
parsing/runtime, export scaling, and backup validation/asset restoration.
