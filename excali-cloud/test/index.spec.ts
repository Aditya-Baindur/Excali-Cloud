import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import worker, { type Env } from '../src/index';

const ISSUER = 'https://test.clerk.accounts.dev';
let privateKey: CryptoKey;
let workerEnv: Env;

beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true });
  privateKey = keys.privateKey;
  workerEnv = {
    ...env,
    CLERK_ISSUER: ISSUER,
    CLERK_JWT_KEY: await exportSPKI(keys.publicKey),
    CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000',
    ALLOW_DEMO_AUTH: 'false',
  };
  const statements = env.TEST_SCHEMA.replace(/^--.*$/gm, '').split(';').map((statement) => statement.trim()).filter(Boolean);
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
});

async function token(userId = 'user_owner', claims: Record<string, unknown> = {}) {
  return new SignJWT({ azp: 'http://localhost:3000', ...claims }).setProtectedHeader({ alg: 'RS256' }).setSubject(userId).setIssuer(ISSUER).setIssuedAt().setExpirationTime('1h').sign(privateKey);
}

async function request(path: string, init: RequestInit = {}, userId: string | null = 'user_owner', customEnv = workerEnv) {
  const headers = new Headers(init.headers);
  if (userId && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${await token(userId)}`);
  return worker.fetch(new Request(`https://api.test${path}`, { ...init, headers }), customEnv);
}

async function data<T>(response: Response) { return response.json<T>(); }
type Share = { id: string; token: string; boardName: string; revokedAt: number | null };
type Video = { id: string; size: number; name: string };
type Folder = { id: string; name: string; createdAt: number; updatedAt: number };
type Board = { id: string; name: string; folderId: string | null; folderName: string | null };
async function createBoard(body: Record<string, unknown> = { name: 'Roadmap' }, userId = 'user_owner') {
  const response = await request('/boards', { method: 'POST', body: JSON.stringify(body) }, userId);
  expect(response.status).toBe(201);
  return (await data<{ boardId: string }>(response)).boardId;
}
async function createFolder(name = 'Projects', userId = 'user_owner') {
  const response = await request('/folders', { method: 'POST', body: JSON.stringify({ name }) }, userId);
  expect(response.status).toBe(201);
  return (await data<{ folder: Folder }>(response)).folder;
}
async function listedBoard(boardId: string) {
  return (await data<{ boards: Board[] }>(await request('/boards'))).boards.find((board) => board.id === boardId);
}
async function shareBoard(boardId: string) {
  const response = await request(`/boards/${boardId}/share`, { method: 'POST' });
  expect(response.status).toBe(200);
  return (await data<{ share: Share }>(response)).share;
}
async function addVideo(boardId: string) {
  const response = await request(`/boards/${boardId}/videos`, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-File-Name': encodeURIComponent('My clip.mp4') }, body: '0123456789' });
  expect(response.status).toBe(201);
  return (await data<{ video: Video }>(response)).video;
}

describe('authentication and ownership', () => {
  it('requires a verified token and ignores arbitrary user headers', async () => {
    expect((await request('/boards', {}, null)).status).toBe(401);
    expect((await request('/boards', { headers: { 'x-user-id': 'user_owner' } }, null)).status).toBe(401);
    expect((await request('/boards', { headers: { Authorization: 'Bearer not-a-jwt' } }, null)).status).toBe(401);
    expect((await request('/boards', {}, 'user_owner')).status).toBe(200);
    const wrongParty = await token('user_owner', { azp: 'https://untrusted.test' });
    expect((await request('/boards', { headers: { Authorization: `Bearer ${wrongParty}` } }, null)).status).toBe(401);
    const expired = await new SignJWT({ azp: 'http://localhost:3000' }).setProtectedHeader({ alg: 'RS256' }).setSubject('user_owner').setIssuer(ISSUER).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey);
    expect((await request('/boards', { headers: { Authorization: `Bearer ${expired}` } }, null)).status).toBe(401);
  });

  it('allows only explicit demo IDs when demo access is enabled', async () => {
    const demoEnv = { ...workerEnv, ALLOW_DEMO_AUTH: 'true' };
    expect((await request('/boards', {}, null, demoEnv)).status).toBe(401);
    expect((await request('/boards', { headers: { 'x-user-id': 'user_owner' } }, null, demoEnv)).status).toBe(401);
    expect((await request('/boards', { headers: { 'x-user-id': 'PUBLIC-USER' } }, null, demoEnv)).status).toBe(200);
    expect((await request('/boards', { headers: { 'x-user-id': 'PUBLIC-USER', Authorization: 'Bearer invalid' } }, null, demoEnv)).status).toBe(401);
  });

  it('does not let another user read or mutate boards, scenes, shares, or videos', async () => {
    const boardId = await createBoard();
    const share = await shareBoard(boardId);
    const video = await addVideo(boardId);
    const operations: [string, RequestInit][] = [
      [`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ name: 'Stolen' }) }],
      [`/boards/${boardId}`, { method: 'DELETE' }],
      [`/boards/${boardId}/scene`, {}],
      [`/boards/${boardId}/scene`, { method: 'PUT', body: JSON.stringify({ elements: [], appState: {} }) }],
      [`/boards/${boardId}/share`, { method: 'POST' }],
      [`/shares/${share.id}`, { method: 'DELETE' }],
      [`/boards/${boardId}/videos`, {}],
      [`/boards/${boardId}/videos`, { method: 'POST', body: 'video' }],
      [`/boards/${boardId}/videos/${video.id}/content`, {}],
      [`/boards/${boardId}/videos/${video.id}`, { method: 'DELETE' }],
    ];
    for (const [path, init] of operations) expect((await request(path, init, 'user_other')).status, path).toBe(404);
    expect(await data(await request('/boards', {}, 'user_other'))).toMatchObject({ boards: [] });
    expect(await data(await request('/shares', {}, 'user_other'))).toMatchObject({ shares: [] });
    expect((await request(`/boards/${boardId}/scene`)).status).toBe(200);
  });
});

describe('private board folders', () => {
  it('isolates folder CRUD by owner and preserves the folder creation time on rename', async () => {
    expect((await request('/folders', {}, null)).status).toBe(401);
    expect((await request('/folders', { headers: { 'X-User-Id': 'user_owner' } }, null)).status).toBe(401);
    const folder = await createFolder('  Work  ');
    const other = await createFolder('Personal', 'user_other');
    expect(folder.name).toBe('Work');
    expect(folder.createdAt).toBeTypeOf('number');
    expect(await data(await request('/folders'))).toEqual({ folders: [folder] });
    expect(await data(await request('/folders', {}, 'user_other'))).toEqual({ folders: [other] });
    expect((await request(`/folders/${folder.id}`, { method: 'PUT', body: JSON.stringify({ name: 'Stolen' }) }, 'user_other')).status).toBe(404);
    expect((await request(`/folders/${folder.id}`, { method: 'DELETE' }, 'user_other')).status).toBe(404);
    const renamed = await request(`/folders/${folder.id}`, { method: 'PUT', body: JSON.stringify({ name: '  Clients  ' }) });
    expect(renamed.status).toBe(200);
    const result = (await data<{ folder: Folder }>(renamed)).folder;
    expect(result).toMatchObject({ id: folder.id, name: 'Clients', createdAt: folder.createdAt });
    expect(result.updatedAt).toBeGreaterThanOrEqual(folder.updatedAt);
    expect((await request(`/folders/${folder.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await request(`/folders/${folder.id}`, { method: 'DELETE' })).status).toBe(404);
    expect(await data(await request('/folders'))).toEqual({ folders: [] });
    expect(await data(await request('/folders', {}, 'user_other'))).toEqual({ folders: [other] });
  });

  it('creates in folders, moves, renames without moving, saves scenes, and unfiles without renaming', async () => {
    const first = await createFolder('First');
    const second = await createFolder('Second');
    const boardId = await createBoard({ name: 'Filed', folderId: first.id });
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Filed', folderId: first.id, folderName: 'First' });
    expect((await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ folderId: second.id }) })).status).toBe(200);
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Filed', folderId: second.id, folderName: 'Second' });
    expect((await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ name: 'Renamed' }) })).status).toBe(200);
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Renamed', folderId: second.id });
    const scene = { elements: [{ id: 'kept' }], appState: { viewBackgroundColor: '#abcdef' }, files: {} };
    expect((await request(`/boards/${boardId}/scene`, { method: 'PUT', body: JSON.stringify(scene) })).status).toBe(200);
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Renamed', folderId: second.id });
    await request(`/folders/${second.id}`, { method: 'PUT', body: JSON.stringify({ name: 'Updated folder' }) });
    expect(await listedBoard(boardId)).toMatchObject({ folderName: 'Updated folder' });
    expect((await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ folderId: null }) })).status).toBe(200);
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Renamed', folderId: null, folderName: null });
    expect(await data(await request(`/boards/${boardId}/scene`))).toMatchObject(scene);
    const unfiled = await createBoard({ name: 'Unfiled', folderId: null });
    expect(await listedBoard(unfiled)).toMatchObject({ folderId: null, folderName: null });
    const legacy = await createBoard();
    expect(await listedBoard(legacy)).toMatchObject({ folderId: null, folderName: null });
    expect((await request(`/boards/${legacy}`, { method: 'PUT', body: JSON.stringify({ name: 'Both', folderId: first.id }) })).status).toBe(200);
    expect(await listedBoard(legacy)).toMatchObject({ name: 'Both', folderId: first.id });
  });

  it('folder deletion preserves board scenes, active public shares and videos without leaking folder metadata', async () => {
    const folder = await createFolder('Private client name');
    const boardId = await createBoard({ name: 'Shared work', folderId: folder.id });
    const video = await addVideo(boardId);
    const share = await shareBoard(boardId);
    const scene = { elements: [{ id: 'video', customData: { videoId: video.id } }], appState: { viewBackgroundColor: '#ffffff' }, files: {} };
    await request(`/boards/${boardId}/scene`, { method: 'PUT', body: JSON.stringify(scene) });
    const before = await data<{ board: Record<string, unknown> }>(await request(`/public/shares/${share.token}`, {}, null));
    expect(Object.keys(before.board).sort()).toEqual(['id', 'name', 'updatedAt']);
    const objects = (await env.BUCKET.list()).objects.map((object) => object.key).sort();
    expect((await request(`/folders/${folder.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Shared work', folderId: null, folderName: null });
    expect(await data(await request(`/boards/${boardId}/scene`))).toMatchObject(scene);
    expect(await data(await request(`/public/shares/${share.token}`, {}, null))).toMatchObject({ board: before.board, scene, videos: [{ id: video.id }] });
    expect(await data(await request('/shares'))).toMatchObject({ shares: [{ id: share.id, token: share.token, revokedAt: null }] });
    const publicVideo = await request(`/public/shares/${share.token}/videos/${video.id}/content`, { headers: { Range: 'bytes=2-5' } }, null);
    expect(publicVideo.status).toBe(206);
    expect(await publicVideo.text()).toBe('2345');
    expect((await env.BUCKET.list()).objects.map((object) => object.key).sort()).toEqual(objects);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM board_folder_assignments').first('count')).toBe(0);
  });

  it('rejects invalid folder input and cross-user moves or creation without changing existing boards or assets', async () => {
    const own = await createFolder();
    const other = await createFolder('Other', 'user_other');
    const boardId = await createBoard({ name: 'Original', folderId: own.id });
    const foreignBoard = await createBoard({ name: 'Foreign' }, 'user_other');
    for (const name of ['', '  ', 'x'.repeat(201), null, 12]) {
      expect((await request('/folders', { method: 'POST', body: JSON.stringify({ name }) })).status).toBe(400);
      expect((await request(`/folders/${own.id}`, { method: 'PUT', body: JSON.stringify({ name }) })).status).toBe(400);
    }
    for (const folderId of ['', ' ', 'has/slash', 'x'.repeat(201), 42, true, {}, []]) {
      expect((await request('/boards', { method: 'POST', body: JSON.stringify({ name: 'Invalid', folderId }) })).status).toBe(400);
      expect((await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ name: 'Invalid', folderId }) })).status).toBe(400);
    }
    for (const folderId of [other.id, 'missing-folder']) {
      expect((await request('/boards', { method: 'POST', body: JSON.stringify({ name: 'Forbidden', folderId }) })).status).toBe(404);
      expect((await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ name: 'Forbidden', folderId }) })).status).toBe(404);
    }
    expect((await request(`/boards/${foreignBoard}`, { method: 'PUT', body: JSON.stringify({ folderId: own.id }) })).status).toBe(404);
    expect((await request(`/boards/${boardId}`, { method: 'PUT', body: '{}' })).status).toBe(400);
    expect((await request('/folders', { method: 'POST', body: '{' })).status).toBe(400);
    expect((await request(`/folders/${own.id}`, { method: 'PUT', body: '{}' })).status).toBe(400);
    expect((await request(`/folders/missing`, { method: 'PUT', body: JSON.stringify({ name: 'Missing' }) })).status).toBe(404);
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Original', folderId: own.id });
    expect((await env.BUCKET.list()).objects).toHaveLength(2);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM boards').first('count')).toBe(2);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM board_folders').first('count')).toBe(2);
  });

  it('database owner constraints roll back the entire batch and board deletion cascades only its assignment', async () => {
    const own = await createFolder();
    const other = await createFolder('Other', 'user_other');
    const boardId = await createBoard();
    for (const [userId, folderId] of [['user_owner', other.id], ['user_other', other.id]]) {
      await expect(env.DB.batch([
        env.DB.prepare('UPDATE boards SET name=? WHERE id=?').bind('Must roll back', boardId),
        env.DB.prepare('INSERT INTO board_folder_assignments (board_id,user_id,folder_id) VALUES (?,?,?)').bind(boardId, userId, folderId),
      ])).rejects.toThrow(/FOREIGN KEY/);
      expect(await listedBoard(boardId)).toMatchObject({ name: 'Roadmap', folderId: null });
    }
    await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ folderId: own.id }) });
    const keptBoard = await createBoard({ name: 'Keep', folderId: own.id });
    expect((await request(`/boards/${boardId}`, { method: 'DELETE' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM board_folder_assignments').first('count')).toBe(1);
    expect(await listedBoard(keptBoard)).toMatchObject({ folderId: own.id });
    expect((await data<{ folders: Folder[] }>(await request('/folders'))).folders).toHaveLength(1);
  });

  it('rolls back creation and combined rename/move when the folder disappears after ownership validation', async () => {
    const source = await createFolder('Source');
    const boardId = await createBoard({ name: 'Original', folderId: source.id });
    const raceEnv = (folderId: string): Env => ({
      ...workerEnv,
      DB: new Proxy(env.DB, {
        get(target, property) {
          if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
            await target.prepare('DELETE FROM board_folders WHERE id=?').bind(folderId).run();
            return target.batch(statements);
          };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    });
    const createTarget = await createFolder('Create target');
    const create = await request('/boards', { method: 'POST', body: JSON.stringify({ name: 'Concurrent create', folderId: createTarget.id }) }, 'user_owner', raceEnv(createTarget.id));
    expect(create.status).toBe(404);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM boards').first('count')).toBe(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM board_scenes').first('count')).toBe(1);
    expect((await env.BUCKET.list()).objects).toHaveLength(1);
    const moveTarget = await createFolder('Move target');
    const move = await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ name: 'Concurrent rename', folderId: moveTarget.id }) }, 'user_owner', raceEnv(moveTarget.id));
    expect(move.status).toBe(404);
    expect(await listedBoard(boardId)).toMatchObject({ name: 'Original', folderId: source.id });
  });

  it('preserves demo board renaming and permits demo folder organization without exposing private folders', async () => {
    const privateFolder = await createFolder('Private');
    const demoEnv = { ...workerEnv, ALLOW_DEMO_AUTH: 'true' };
    const headers = { 'X-User-Id': 'PUBLIC-USER' };
    const created = await request('/boards', { method: 'POST', headers, body: JSON.stringify({ name: 'Demo' }) }, null, demoEnv);
    const { boardId } = await data<{ boardId: string }>(created);
    expect((await request(`/boards/${boardId}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Demo renamed' }) }, null, demoEnv)).status).toBe(200);
    expect(await data(await request('/folders', { headers }, null, demoEnv))).toEqual({ folders: [] });
    expect((await request(`/boards/${boardId}`, { method: 'PUT', headers, body: JSON.stringify({ folderId: privateFolder.id }) }, null, demoEnv)).status).toBe(404);
    expect(await data(await request('/boards', { headers }, null, demoEnv))).toMatchObject({ boards: [{ name: 'Demo renamed', folderId: null, folderName: null }] });
  });
});

describe('scene overwrite protection and recovery revisions', () => {
  const scene = (id: string, isDeleted = false) => ({
    elements: [{ id, type: 'rectangle', x: 10, y: 20, isDeleted }],
    appState: { viewBackgroundColor: '#abcdef' },
    files: { image: { id: 'image', dataURL: 'data:image/png;base64,aGVsbG8=' } },
  });
  const write = (boardId: string, payload: unknown, customEnv = workerEnv) => request(`/boards/${boardId}/scene`, { method: 'PUT', body: JSON.stringify(payload) }, 'user_owner', customEnv);
  const prefix = (boardId: string) => `users/user_owner/boards/${boardId}/revisions/`;
  const currentKey = (boardId: string) => `users/user_owner/boards/${boardId}/scene.json`;

  it('rejects empty old-client overwrites without changing the scene, timestamps, shares, or revisions', async () => {
    const boardId = await createBoard();
    expect((await write(boardId, { elements: [], appState: {}, files: {} })).status).toBe(200);
    expect((await write(boardId, scene('keep'))).status).toBe(200);
    const share = await shareBoard(boardId);
    const saved = await (await env.BUCKET.get(currentKey(boardId)))!.text();
    const before = await env.DB.prepare('SELECT updated_at FROM board_scenes WHERE board_id=?').bind(boardId).first('updated_at');
    const revisions = (await env.BUCKET.list({ prefix: prefix(boardId) })).objects.map((object) => object.key);
    const result = await write(boardId, { elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} });
    expect(result.status).toBe(409);
    expect(await data(result)).toMatchObject({ ok: false, code: 'empty_scene_guard' });
    expect(await (await env.BUCKET.get(currentKey(boardId)))!.text()).toBe(saved);
    expect(await env.DB.prepare('SELECT updated_at FROM board_scenes WHERE board_id=?').bind(boardId).first('updated_at')).toBe(before);
    expect((await env.BUCKET.list({ prefix: prefix(boardId) })).objects.map((object) => object.key)).toEqual(revisions);
    expect(await data(await request(`/public/shares/${share.token}`, {}, null))).toMatchObject({ scene: scene('keep') });
  });

  it('accepts intentional delete-all tombstones and retains exact previous scenes including image data', async () => {
    const boardId = await createBoard();
    expect((await write(boardId, scene('first'))).status).toBe(200);
    const first = await (await env.BUCKET.get(currentKey(boardId)))!.text();
    expect((await write(boardId, scene('second'))).status).toBe(200);
    const second = await (await env.BUCKET.get(currentKey(boardId)))!.text();
    expect((await write(boardId, scene('second', true))).status).toBe(200);
    expect(await data(await request(`/boards/${boardId}/scene`))).toMatchObject(scene('second', true));
    const revisions = (await env.BUCKET.list({ prefix: prefix(boardId) })).objects;
    expect(revisions).toHaveLength(3);
    const bodies = await Promise.all(revisions.map(async (object) => (await env.BUCKET.get(object.key))!.text()));
    expect(bodies).toContain(first);
    expect(bodies).toContain(second);
    for (const object of revisions) {
      const stored = await env.BUCKET.head(object.key);
      expect(stored!.httpMetadata?.cacheControl).toBe('private, no-store');
    }
    expect((await request(`/boards/${boardId}/scene/revisions`, {}, 'user_other')).status).toBe(404);
  });

  it('refuses an overwrite if archiving the previous scene fails', async () => {
    const boardId = await createBoard();
    expect((await write(boardId, scene('original'))).status).toBe(200);
    const saved = await (await env.BUCKET.get(currentKey(boardId)))!.text();
    const failingEnv: Env = {
      ...workerEnv,
      BUCKET: new Proxy(env.BUCKET, {
        get(target, property) {
          if (property === 'put') return async (key: string, value: string, options?: R2PutOptions) => {
            if (key.startsWith(prefix(boardId))) throw new Error('Simulated archive outage');
            return target.put(key, value, options);
          };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    };
    expect((await write(boardId, scene('replacement'), failingEnv)).status).toBe(500);
    expect(await (await env.BUCKET.get(currentKey(boardId)))!.text()).toBe(saved);
  });

  it('conditional writes preserve a scene saved concurrently after the previous scene was checked', async () => {
    const boardId = await createBoard();
    expect((await write(boardId, scene('original'))).status).toBe(200);
    const winner = JSON.stringify(scene('concurrent winner'));
    const racingEnv: Env = {
      ...workerEnv,
      BUCKET: new Proxy(env.BUCKET, {
        get(target, property) {
          if (property === 'put') return async (key: string, value: string, options?: R2PutOptions) => {
            if (key.startsWith(prefix(boardId))) await target.put(currentKey(boardId), winner);
            return target.put(key, value, options);
          };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    };
    const result = await write(boardId, scene('stale replacement'), racingEnv);
    expect(result.status).toBe(409);
    expect(await data(result)).toMatchObject({ code: 'scene_conflict' });
    expect(await (await env.BUCKET.get(currentKey(boardId)))!.text()).toBe(winner);
  });

  it('bounds revisions to 50 prior scenes and board deletion removes only that board’s recovery copies', async () => {
    const boardId = await createBoard();
    const otherBoard = await createBoard();
    expect((await write(otherBoard, scene('other board'))).status).toBe(200);
    for (let index = 0; index < 53; index++) expect((await write(boardId, scene(`version-${index}`))).status).toBe(200);
    const revisions = (await env.BUCKET.list({ prefix: prefix(boardId) })).objects;
    expect(revisions).toHaveLength(50);
    const previousScenes = await Promise.all(revisions.map(async (object) => (await env.BUCKET.get(object.key))!.json<{ elements: { id: string }[] }>()));
    expect(previousScenes.map((item) => item.elements[0]?.id).sort()).toEqual(Array.from({ length: 50 }, (_, index) => `version-${index + 2}`).sort());
    expect(await data(await request(`/boards/${boardId}/scene`))).toMatchObject(scene('version-52'));
    expect((await request(`/boards/${boardId}`, { method: 'DELETE' })).status).toBe(200);
    expect((await env.BUCKET.list({ prefix: prefix(boardId) })).objects).toHaveLength(0);
    expect((await env.BUCKET.list({ prefix: prefix(otherBoard) })).objects).toHaveLength(1);
    expect(await data(await request(`/boards/${otherBoard}/scene`))).toMatchObject(scene('other board'));
  });
});

describe('public shares', () => {
  it('reuses an active link, exposes the current scene anonymously, and revokes immediately', async () => {
    const boardId = await createBoard();
    const [share, duplicate] = await Promise.all([shareBoard(boardId), shareBoard(boardId)]);
    expect(duplicate.token).toBe(share.token);
    expect(share.token).toMatch(/^[a-f0-9]{64}$/);
    const scene = { elements: [{ id: 'rectangle' }], appState: { viewBackgroundColor: '#eeeeee' }, files: {} };
    expect((await request(`/boards/${boardId}/scene`, { method: 'PUT', body: JSON.stringify(scene) })).status).toBe(200);
    const publicResponse = await request(`/public/shares/${share.token}`, {}, null);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(await data(publicResponse)).toMatchObject({ board: { name: 'Roadmap' }, scene, videos: [] });
    expect(await data(await request('/boards'))).toMatchObject({ boards: [{ share: { id: share.id } }] });
    await request(`/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ name: 'Renamed board' }) });
    expect(await data(await request('/shares'))).toMatchObject({ shares: [{ boardName: 'Renamed board', revokedAt: null }] });
    expect((await request(`/shares/${share.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await request(`/public/shares/${share.token}`, {}, null)).status).toBe(404);
    expect((await request('/public/shares/missing', {}, null)).status).toBe(404);
    const newShare = await shareBoard(boardId);
    expect(newShare.token).not.toBe(share.token);
    const history = await data<{ shares: Share[] }>(await request('/shares'));
    expect(history.shares).toHaveLength(2);
    expect(history.shares.find((item) => item.id === share.id)?.revokedAt).toBeTypeOf('number');
  });
});

describe('videos', () => {
  it('preserves canvas video metadata and moved/resized geometry in private and shared scenes', async () => {
    const boardId = await createBoard();
    const video = await addVideo(boardId);
    const share = await shareBoard(boardId);
    const element = {
      id: 'canvas-video',
      type: 'embeddable',
      x: 120.25,
      y: 80.5,
      width: 480,
      height: 270,
      angle: 0,
      link: `https://board-video.invalid/${boardId}/${video.id}`,
      customData: { type: 'board-video', boardId, videoId: video.id, name: video.name },
    };
    const movedAndResized = { ...element, x: -42.5, y: 312.75, width: 720, height: 405 };

    for (const savedElement of [element, movedAndResized]) {
      const scene = { elements: [savedElement], appState: { viewBackgroundColor: '#ffffff' }, files: {} };
      const saved = await request(`/boards/${boardId}/scene`, { method: 'PUT', body: JSON.stringify(scene) });
      expect(saved.status).toBe(200);

      const privateResponse = await request(`/boards/${boardId}/scene`);
      expect(privateResponse.status).toBe(200);
      const privateScene = await data<{ elements: typeof scene.elements }>(privateResponse);
      expect(privateScene.elements).toEqual(scene.elements);

      const publicResponse = await request(`/public/shares/${share.token}`, {}, null);
      expect(publicResponse.status).toBe(200);
      const publicBoard = await data<{ scene: { elements: typeof scene.elements }; videos: Video[] }>(publicResponse);
      expect(publicBoard.scene.elements).toEqual(scene.elements);
      expect(publicBoard.videos).toContainEqual(expect.objectContaining({ id: video.id }));
    }
  });

  it('never lets a public share play videos from another board, even with the same owner', async () => {
    const sharedBoardId = await createBoard();
    const privateBoardId = await createBoard();
    const sharedVideo = await addVideo(sharedBoardId);
    const privateVideo = await addVideo(privateBoardId);
    const share = await shareBoard(sharedBoardId);
    const publicPrefix = `/public/shares/${share.token}/videos`;

    const allowed = await request(`${publicPrefix}/${sharedVideo.id}/content`, {}, null);
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe('0123456789');

    for (const init of [{}, { headers: { Range: 'bytes=0-3' } }, { method: 'HEAD' }]) {
      const denied = await request(`${publicPrefix}/${privateVideo.id}/content`, init, null);
      expect(denied.status).toBe(404);
      expect(denied.headers.get('Content-Range')).toBeNull();
    }
    const publicBoard = await data<{ videos: Video[] }>(await request(`/public/shares/${share.token}`, {}, null));
    expect(publicBoard.videos.map((video) => video.id)).toEqual([sharedVideo.id]);
  });

  it('uploads, lists, streams full and ranged content, and applies share revocation to playback', async () => {
    const boardId = await createBoard();
    const video = await addVideo(boardId);
    expect(video).toMatchObject({ size: 10, name: 'My clip.mp4' });
    expect(await data(await request(`/boards/${boardId}/videos`))).toMatchObject({ videos: [{ id: video.id }] });
    const url = `/boards/${boardId}/videos/${video.id}/content`;
    const full = await request(url);
    expect(full.headers.get('Content-Type')).toBe('video/mp4');
    expect(await full.text()).toBe('0123456789');
    const range = await request(url, { headers: { Range: 'bytes=2-5' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(range.headers.get('Content-Length')).toBe('4');
    expect(await range.text()).toBe('2345');
    expect(await (await request(url, { headers: { Range: 'bytes=-3' } })).text()).toBe('789');
    expect(await (await request(url, { headers: { Range: 'bytes=7-' } })).text()).toBe('789');
    for (const value of ['bytes=20-30', 'bytes=-0', 'bytes=5-2', 'bytes=0-1,4-5', 'bytes=']) {
      const invalid = await request(url, { headers: { Range: value } });
      expect(invalid.status).toBe(416);
      expect(invalid.headers.get('Content-Range')).toBe('bytes */10');
    }
    const share = await shareBoard(boardId);
    const publicUrl = `/public/shares/${share.token}/videos/${video.id}/content`;
    expect(await (await request(publicUrl, {}, null)).text()).toBe('0123456789');
    expect(await data(await request(`/public/shares/${share.token}`, {}, null))).toMatchObject({ videos: [{ id: video.id }] });
    await request(`/shares/${share.id}`, { method: 'DELETE' });
    expect((await request(publicUrl, { headers: { Range: 'bytes=0-1' } }, null)).status).toBe(404);
    expect((await request(`/boards/${boardId}/videos/${video.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await request(url)).status).toBe(404);
    expect((await env.BUCKET.list()).objects).toHaveLength(1); // Only the scene remains.
  });

  it('rejects unsupported, empty, oversized, or invalidly named uploads', async () => {
    const boardId = await createBoard();
    const url = `/boards/${boardId}/videos`;
    expect((await request(url, { method: 'POST', headers: { 'Content-Type': 'text/html', 'X-File-Name': 'test.html' }, body: 'html' })).status).toBe(415);
    expect((await request(url, { method: 'POST', headers: { 'Content-Type': 'video/webm', 'X-File-Name': 'empty.webm' }, body: '' })).status).toBe(400);
    expect((await request(url, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-File-Name': 'too-big.mp4', 'Content-Length': String(50 * 1024 * 1024 + 1) }, body: 'video' })).status).toBe(413);
    expect((await request(url, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-File-Name': '%ZZ' }, body: 'video' })).status).toBe(400);
    expect(await data(await request(url))).toMatchObject({ videos: [] });
  });

  it('enforces the byte limit while streaming even without Content-Length', async () => {
    const boardId = await createBoard();
    let remaining = 51;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!remaining--) controller.close();
        else controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    const response = await request(`/boards/${boardId}/videos`, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-File-Name': 'large.mp4' }, body });
    expect(response.status).toBe(413);
    expect((await env.BUCKET.list()).objects).toHaveLength(1);
    expect(await data(await request(`/boards/${boardId}/videos`))).toMatchObject({ videos: [] });
  });

  it('removes all share, video, and scene data when the owner deletes a board', async () => {
    const boardId = await createBoard();
    const video = await addVideo(boardId);
    const share = await shareBoard(boardId);
    expect((await request(`/boards/${boardId}`, { method: 'DELETE' })).status).toBe(200);
    expect((await request(`/public/shares/${share.token}`, {}, null)).status).toBe(404);
    expect((await request(`/boards/${boardId}/videos/${video.id}/content`)).status).toBe(404);
    expect((await request(`/boards/${boardId}/scene`)).status).toBe(404);
    expect((await env.BUCKET.list()).objects).toHaveLength(0);
    for (const table of ['boards', 'board_scenes', 'board_videos', 'board_shares']) {
      expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first('count')).toBe(0);
    }
  });

  it('supports direct browser upload and playback CORS headers', async () => {
    const response = await request('/boards/board/videos', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } }, null);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-File-Name');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Range');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Content-Range');
  });
});
