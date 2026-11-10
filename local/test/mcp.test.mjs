import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWorkspaceServer } from '../server/app.mjs';
import { createMcpServer } from '../server/mcp.mjs';

const ownerKey = 'owner-key-for-contract-tests-0001';

function waitForBoard(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for updated board')), 3000);
    const onMessage = raw => {
      const event = JSON.parse(raw.toString());
      if (event.type === 'board' && predicate(event.board)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(event.board);
      }
    };
    socket.on('message', onMessage);
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

function resultData(result) {
  assert.equal(result.isError, undefined, result.content?.map(item => item.text).join('\n'));
  const text = result.content?.find(item => item.type === 'text')?.text;
  assert.ok(text, 'tool returns JSON as text content');
  return JSON.parse(text);
}

test('real MCP client edits the board seen by a live observer and stale writes fail', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'brainwriting-mcp-'));
  const app = createWorkspaceServer({ directory, ownerKey, host: '127.0.0.1', port: 0 });
  const baseUrl = await app.listen();
  const mcp = createMcpServer({ baseUrl, ownerKey });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'contract-test-client', version: '1.0.0' });
  const socketRef = { current: null };
  t.after(async () => {
    socketRef.current?.close();
    await client.close();
    await mcp.close();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map(tool => tool.name);
  for (const name of ['list_boards', 'create_board', 'read_board', 'add_elements', 'connect_elements', 'update_elements', 'write_brief', 'post_message']) {
    assert.ok(toolNames.includes(name), `MCP server exposes ${name}`);
  }
  assert.ok(toolNames.includes('set_phase'), 'MCP server exposes set_phase');
  assert.ok(toolNames.includes('update_session'), 'MCP server exposes update_session');

  const created = resultData(await client.callTool({ name: 'create_board', arguments: { name: 'MCP board', template: 'blank' } }));
  const boardId = created.id ?? created.board?.id;
  assert.ok(boardId, 'create_board returns a board id');
  const listed = resultData(await client.callTool({ name: 'list_boards', arguments: {} }));
  assert.ok((listed.boards ?? listed).some(board => board.id === boardId));

  const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/live/${boardId}`, { headers: { authorization: `Bearer ${ownerKey}` } });
  socketRef.current = socket;
  const initialPromise = waitForBoard(socket, board => board.id === boardId);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  await initialPromise;

  const added = resultData(await client.callTool({
    name: 'add_elements',
    arguments: { boardId, items: [
      { type: 'note', text: 'First thought', x: 10, y: 20 },
      { type: 'note', text: 'Build on it', x: 260, y: 20 },
    ] },
  }));
  assert.ok(added);
  const readAfterAdd = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  const elements = (readAfterAdd.board ?? readAfterAdd).elements;
  assert.ok(Array.isArray(elements));
  assert.ok(elements.length >= 2);
  const rectangles = elements.filter(element => element.type === 'rectangle');
  assert.ok(rectangles.length >= 2, 'each note creates a rectangle shape and bound text');
  const [first, second] = rectangles;
  const latestPromise = waitForBoard(socket, board => board.elements?.some(element => element.id === first.id)
    && board.elements?.some(element => element.id === second.id));

  const linked = resultData(await client.callTool({ name: 'connect_elements', arguments: { boardId, fromId: first.id, toId: second.id } }));
  assert.ok(linked);
  const latest = await latestPromise;
  assert.ok(latest.elements.some(element => element.id === first.id));
  assert.ok(latest.elements.some(element => element.id === second.id));

  const read = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  const board = read.board ?? read;
  assert.equal(board.id, boardId);
  assert.ok(board.elements.some(element => element.id === first.id));

  const stale = await client.callTool({
    name: 'update_elements',
    arguments: { boardId, expectedRevision: 0, updates: [{ id: first.id, text: 'Stale overwrite' }] },
  });
  assert.equal(stale.isError, true, 'stale destructive updates are reported as MCP tool errors');
  const oldLabel = app.store.read(boardId).elements.find(e => e.containerId === first.id);
  const moved = resultData(await client.callTool({ name: 'update_elements', arguments: {
    boardId, expectedRevision: board.revision, updates: [{ id: first.id, x: first.x + 100, y: first.y + 50 }],
  } }));
  assert.equal(moved.elements, undefined, 'writes return a small ack, not the board');
  const movedLabel = app.store.read(boardId).elements.find(e => e.id === oldLabel.id);
  assert.equal(movedLabel.x, oldLabel.x + 100);
  assert.equal(movedLabel.y, oldLabel.y + 50);

  const beforeVote = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  const currentBoard = beforeVote.board ?? beforeVote;
  assert.equal(currentBoard.session?.phase, 'diverge');
  const promptList = await client.listPrompts();
  assert.ok(promptList.prompts.some(prompt => prompt.name === 'brainstorm'));
  const divergentPrompt = await client.getPrompt({ name: 'brainstorm', arguments: { boardId } });
  const divergentText = JSON.stringify(divergentPrompt).toLowerCase();
  assert.match(divergentText, /diverg|independent|generate/);
  const rejectedVote = await fetch(`${baseUrl}/api/boards/${boardId}/vote`, {
    method: 'POST', headers: { authorization: `Bearer ${ownerKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ elementId: first.id }),
  });
  assert.equal(rejectedVote.status, 409, 'votes are unavailable during divergent generation');

  resultData(await client.callTool({ name: 'update_session', arguments: {
    boardId, expectedRevision: currentBoard.revision, hmw: 'How might we help?', criteria: 'Useful ideas',
  } }));
  const afterSession = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  const sessionBoard = afterSession.board ?? afterSession;
  resultData(await client.callTool({ name: 'set_phase', arguments: {
    boardId, expectedRevision: sessionBoard.revision, phase: 'converge',
  } }));
  const acceptedVote = await fetch(`${baseUrl}/api/boards/${boardId}/vote`, {
    method: 'POST', headers: { authorization: `Bearer ${ownerKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ elementId: first.id }),
  });
  assert.equal(acceptedVote.status, 200);
  const voted = await acceptedVote.json();
  const votedBoard = voted.board ?? voted;
  assert.equal(Object.values(votedBoard.votes).reduce((sum, ids) =>
    sum + ids.filter(id => id === first.id).length, 0), 1);

  const focusBase = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  const focusBoard = focusBase.board ?? focusBase;
  const focusResponse = await fetch(`${baseUrl}/api/boards/${boardId}/patch`, {
    method: 'POST', headers: { authorization: `Bearer ${ownerKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: focusBoard.revision, focus: {
      elementIds: [first.id], instruction: 'Diverge thinking',
    } }),
  });
  assert.equal(focusResponse.status, 200);
  const focused = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  assert.deepEqual((focused.board ?? focused).focus, { elementIds: [first.id], instruction: 'Diverge thinking' });

  const convergentPrompt = await client.getPrompt({ name: 'brainstorm', arguments: { boardId } });
  const convergentText = JSON.stringify(convergentPrompt).toLowerCase();
  assert.match(convergentText, /converg|vote|decide/);
  assert.notEqual(divergentText, convergentText, 'brainstorm prompt adapts to the active session phase');
});

test('read_board leaves out image data and AI edits use random nonces', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'brainwriting-mcp-files-'));
  const app = createWorkspaceServer({ directory, ownerKey, host: '127.0.0.1', port: 0 });
  const baseUrl = await app.listen();
  const mcp = createMcpServer({ baseUrl, ownerKey });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'files-test-client', version: '1.0.0' });
  t.after(async () => { await client.close(); await mcp.close(); await app.close(); await rm(directory, { recursive: true, force: true }); });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  const { id: boardId } = resultData(await client.callTool({ name: 'create_board', arguments: { name: 'Files', template: 'blank' } }));
  app.store.patch(boardId, { files: { image1: { id: 'image1', mimeType: 'image/png', dataURL: 'data:image/png;base64,aGVsbG8=', created: 1 } } });
  resultData(await client.callTool({ name: 'add_elements', arguments: { boardId, items: [{ type: 'note', text: 'A' }, { type: 'note', text: 'B' }] } }));
  const board = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  assert.deepEqual(board.files, { image1: { mimeType: 'image/png' } });
  const [a, b] = board.elements.filter(e => e.type === 'rectangle');
  resultData(await client.callTool({ name: 'connect_elements', arguments: { boardId, fromId: a.id, toId: b.id } }));
  const edited = app.store.read(boardId).elements.find(e => e.id === a.id);
  assert.notEqual(edited.versionNonce, 0, 'a fixed nonce of 0 would always win ties against human edits');
});

test('add_elements creates nodes and arrows in one call; read_board is compact', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'brainwriting-mcp-batch-'));
  const app = createWorkspaceServer({ directory, ownerKey, host: '127.0.0.1', port: 0 });
  const baseUrl = await app.listen();
  const mcp = createMcpServer({ baseUrl, ownerKey });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'batch-test-client', version: '1.0.0' });
  t.after(async () => { await client.close(); await mcp.close(); await app.close(); await rm(directory, { recursive: true, force: true }); });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  const { id: boardId } = resultData(await client.callTool({ name: 'create_board', arguments: { name: 'Batch', template: 'blank' } }));
  const first = resultData(await client.callTool({ name: 'add_elements', arguments: { boardId, items: [{ type: 'note', text: 'Old' }] } }));
  assert.equal(first.ids.length, 1);
  assert.equal(typeof first.revision, 'number');
  const added = resultData(await client.callTool({ name: 'add_elements', arguments: { boardId,
    items: [{ type: 'rectangle', text: 'A' }, { type: 'diamond', text: 'B' }],
    connections: [{ from: 0, to: 1 }, { from: first.ids[0], to: 0 }] } }));
  assert.equal(added.ids.length, 2);
  assert.equal(added.arrowIds.length, 2);
  assert.equal(added.elements, undefined, 'ack, not the board');

  const stored = app.store.read(boardId).elements;
  const [a, b] = added.ids.map(id => stored.find(e => e.id === id));
  assert.deepEqual(a.boundElements.filter(x => x.type === 'arrow').map(x => x.id).sort(), [...added.arrowIds].sort(), 'A is bound to both arrows');
  assert.ok(b.boundElements.some(x => x.id === added.arrowIds[0]));
  const old = stored.find(e => e.id === first.ids[0]);
  assert.ok(old.boundElements.some(x => x.id === added.arrowIds[1]), 'existing node gets the arrow binding');
  assert.equal(old.version, 2);

  resultData(await client.callTool({ name: 'update_elements', arguments: { boardId, expectedRevision: app.store.read(boardId).revision, updates: [{ id: first.ids[0], isDeleted: true }] } }));
  const board = resultData(await client.callTool({ name: 'read_board', arguments: { boardId } }));
  assert.ok(!board.elements.some(e => e.id === first.ids[0]), 'deleted elements are left out');
  assert.ok(!board.elements.some(e => e.type === 'text'), 'bound labels fold into their shapes');
  const readA = board.elements.find(e => e.id === a.id);
  assert.equal(readA.text, 'A');
  assert.equal(readA.seed, undefined, 'render-only fields are dropped');
  const arrow = board.elements.find(e => e.id === added.arrowIds[0]);
  assert.deepEqual([arrow.from, arrow.to], [a.id, b.id]);

  const bad = await client.callTool({ name: 'add_elements', arguments: { boardId, items: [{ type: 'note', text: 'C' }], connections: [{ from: 0, to: 'missing-id' }] } });
  assert.equal(bad.isError, true, 'unknown connection ends are rejected');
});
