import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createWorkspaceServer } from '../server/app.mjs';
import { makeElements } from '../shared/scene.mjs';

const ownerKey = 'owner-key-for-contract-tests-0001';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'brainwriting-server-'));
  const app = createWorkspaceServer({ directory, ownerKey, host: '127.0.0.1', port: 0 });
  const baseUrl = await app.listen();
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { ...app, baseUrl, directory };
}

const ownerHeaders = { authorization: `Bearer ${ownerKey}`, 'content-type': 'application/json' };
async function json(response) { return response.json(); }
function wsUrl(baseUrl, id) { return `${baseUrl.replace(/^http/, 'ws')}/live/${id}`; }

function nextBoard(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for board event')), 3000);
    const onMessage = data => {
      const event = JSON.parse(data.toString());
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

test('owner can create/read boards and unauthorized requests are rejected', async t => {
  const { baseUrl } = await setup(t);
  const denied = await fetch(`${baseUrl}/api/boards`);
  assert.equal(denied.status, 401);

  const createdResponse = await fetch(`${baseUrl}/api/boards`, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify({ name: 'Ideas', template: 'brainwriting' }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await json(createdResponse);
  assert.ok(created.id);
  assert.equal(created.name, 'Ideas');

  const listed = await json(await fetch(`${baseUrl}/api/boards`, { headers: ownerHeaders }));
  assert.ok(listed.boards.some(board => board.id === created.id));
  const read = await json(await fetch(`${baseUrl}/api/boards/${created.id}`, { headers: ownerHeaders }));
  assert.equal(read.id, created.id);
});

test('invite session is board-scoped; guest cannot list or access another board', async t => {
  const { baseUrl } = await setup(t);
  const create = async name => json(await fetch(`${baseUrl}/api/boards`, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify({ name, template: 'blank' }),
  }));
  const a = await create('A');
  const b = await create('B');
  const invite = await json(await fetch(`${baseUrl}/api/boards/${a.id}/invite`, { method: 'POST', headers: ownerHeaders }));
  assert.ok(invite.token);
  const session = await fetch(`${baseUrl}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: invite.token, boardId: a.id }),
  });
  assert.ok(session.ok);
  const cookie = session.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie, 'session exchange sets a cookie');

  assert.equal((await fetch(`${baseUrl}/api/boards`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/boards/${a.id}`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/boards/${b.id}`, { headers: { cookie } })).status, 403);
  const patch = await fetch(`${baseUrl}/api/boards/${a.id}/patch`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ brief: 'Guest contribution' }),
  });
  assert.equal(patch.status, 200);
  assert.equal((await json(await fetch(`${baseUrl}/api/boards/${a.id}`, { headers: ownerHeaders }))).brief, 'Guest contribution');
});

test('foreign Origin is rejected and WebSocket observers receive initial and persisted updates', async t => {
  const { baseUrl } = await setup(t);
  const originCheck = await fetch(`${baseUrl}/api/boards`, {
    method: 'POST', headers: { ...ownerHeaders, origin: 'http://attacker.example' },
    body: JSON.stringify({ name: 'Blocked', template: 'blank' }),
  });
  assert.equal(originCheck.status, 403);

  const board = await json(await fetch(`${baseUrl}/api/boards`, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify({ name: 'Live', template: 'blank' }),
  }));
  const socket = new WebSocket(wsUrl(baseUrl, board.id), { headers: { authorization: `Bearer ${ownerKey}` } });
  t.after(() => socket.close());
  const initialPromise = nextBoard(socket);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const initial = await initialPromise;
  assert.equal(initial.id, board.id);
  const changed = nextBoard(socket, current => current.brief === 'Shared brief');
  const response = await fetch(`${baseUrl}/api/boards/${board.id}/patch`, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify({ brief: 'Shared brief' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await changed).brief, 'Shared brief');
});

test('two live clients retain independent element patches and restart restores accepted state', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'brainwriting-restart-'));
  let app = createWorkspaceServer({ directory, ownerKey, host: '127.0.0.1', port: 0 });
  let baseUrl = await app.listen();
  let sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const created = await json(await fetch(`${baseUrl}/api/boards`, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify({ name: 'Concurrent', template: 'blank' }),
  }));
  const [left, right] = [0, 1].map(() => new WebSocket(wsUrl(baseUrl, created.id), {
    headers: { authorization: `Bearer ${ownerKey}` },
  }));
  sockets = [left, right];
  const leftInitial = nextBoard(left, board => board.id === created.id);
  const rightInitial = nextBoard(right, board => board.id === created.id);
  await Promise.all([left, right].map(socket => new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  })));
  await Promise.all([leftInitial, rightInitial]);

  const generated = makeElements([
    { type: 'rectangle', text: 'Left client', x: 10, y: 10 },
    { type: 'rectangle', text: 'Right client', x: 300, y: 10 },
  ]);
  const shapes = generated.filter(element => element.type === 'rectangle');
  assert.equal(shapes.length, 2);
  const [leftShape, rightShape] = shapes;
  const patch = element => fetch(`${baseUrl}/api/boards/${created.id}/patch`, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify({ elements: [element] }),
  });
  const leftFirst = nextBoard(left, board => board.elements?.some(element => element.id === leftShape.id));
  const rightFirst = nextBoard(right, board => board.elements?.some(element => element.id === leftShape.id));
  const leftResponse = await patch(leftShape);
  assert.equal(leftResponse.status, 200);
  const firstViews = await Promise.all([leftFirst, rightFirst]);
  for (const state of firstViews) assert.ok(state.elements.some(element => element.id === leftShape.id));

  const leftSecond = nextBoard(left, board => board.elements?.some(element => element.id === rightShape.id));
  const rightSecond = nextBoard(right, board => board.elements?.some(element => element.id === rightShape.id));
  const rightResponse = await patch(rightShape);
  assert.equal(rightResponse.status, 200);
  const [leftSeen, rightSeen] = await Promise.all([leftSecond, rightSecond]);
  for (const state of [leftSeen, rightSeen]) {
    assert.ok(state.elements.some(element => element.id === leftShape.id));
    assert.ok(state.elements.some(element => element.id === rightShape.id));
  }

  for (const socket of sockets) socket.close();
  sockets = [];
  await app.close();
  app = createWorkspaceServer({ directory, ownerKey, host: '127.0.0.1', port: 0 });
  baseUrl = await app.listen();
  const restored = await json(await fetch(`${baseUrl}/api/boards/${created.id}`, { headers: ownerHeaders }));
  assert.ok(restored.elements.some(element => element.id === leftShape.id));
  assert.ok(restored.elements.some(element => element.id === rightShape.id));
});
