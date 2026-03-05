// apps/worker/src/index.ts

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ALLOW_DEMO_AUTH?: string;
}

type BoardRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

type CreateBoardBody = {
  name?: string;
};

type ExcalidrawScenePayload = {
  type?: string;
  version?: number;
  updatedAt?: number;
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
};

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * STRICT CORS
 * - Allows only known frontend origins (localhost + Pages + custom domain)
 * - Blocks all other browser origins (403)
 * - Allows curl/server-to-server via "*"
 *
 * IMPORTANT:
 * Add your real Pages/custom domains below.
 */
function corsHeaders(req: Request): {
  ok: true;
  headers: Record<string, string>;
} | {
  ok: false;
  headers: Record<string, string>;
} {
  const origin = req.headers.get("Origin");

  const ALLOWED_ORIGINS = new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    // "https://excali-cloud.pages.dev",
    // "https://excali.adityabaindur.dev",
  ]);

  // Non-browser request
  if (!origin) {
    return {
      ok: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
      },
    };
  }

  // Blocked browser origin
  if (!ALLOWED_ORIGINS.has(origin)) {
    return {
      ok: false,
      headers: {
        "Access-Control-Allow-Origin": "null",
        "Vary": "Origin",
      },
    };
  }

  const requestHeaders = req.headers.get("Access-Control-Request-Headers");

  return {
    ok: true,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers":
        requestHeaders ?? "Content-Type, Authorization, x-user-id",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  };
}


function withCors(req: Request, res: Response) {
  const cors = corsHeaders(req);

  if (!cors.ok) {
    return new Response("CORS blocked", { status: 403 });
  }

  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors.headers)) {
    headers.set(k, v);
  }

  return new Response(res.body, { status: res.status, headers });
}


function notFound() {
  return new Response("Not found", { status: 404 });
}

function badRequest(msg: string) {
  return json({ ok: false, error: msg }, { status: 400 });
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * AUTH (MVP)
 * For now: accept x-user-id header.
 * Replace this with Clerk JWT verification later.
 */
function getUserId(req: Request, env: Env): string | null {
  const demo = env.ALLOW_DEMO_AUTH === "true";
  if (!demo) return null;

  const userId = req.headers.get("x-user-id");
  if (!userId) {
    console.log("NO USER ID PROVIDED")
    return null;
  }

  return userId;
}

function parsePath(url: string) {
  const u = new URL(url);
  return u.pathname.replace(/\/+$/, "") || "/";
}

function match(pattern: RegExp, path: string) {
  return path.match(pattern);
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Preflight
    if (req.method === "OPTIONS") {
      return withCors(req, new Response(null, { status: 204 }));
    }

    const path = parsePath(req.url);

    // Health
    if (path === "/") {
      return withCors(req, json({ ok: true, service: "excali-cloud-api" }));
    }

    const userId = getUserId(req, env);
    if (!userId) {
      return withCors(req, json({ ok: false, error: "Unauthorized" }, { status: 401 }));
    }

    try {
      /**
       * GET /boards
       */
      if (req.method === "GET" && path === "/boards") {
        const res = await env.DB.prepare(
          `SELECT id, user_id, name, created_at, updated_at
           FROM boards
           WHERE user_id = ?
           ORDER BY updated_at DESC`
        )
          .bind(userId)
          .all<BoardRow>();

        const boards =
          res.results?.map((r) => ({
            id: r.id,
            name: r.name,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })) ?? [];

        return withCors(req, json({ ok: true, boards }));
      }

      /**
       * POST /boards  { name }
       */
      if (req.method === "POST" && path === "/boards") {
        const body = await readJson<CreateBoardBody>(req);
        const name = safeString(body?.name).trim();

        if (!name) return withCors(req, badRequest("Missing name"));

        const boardId = crypto.randomUUID();
        const now = Date.now();

        await env.DB.prepare(
          `INSERT INTO boards (id, user_id, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(boardId, userId, name, now, now)
          .run();

        // Create empty scene in R2 and pointer row in D1
        const r2Key = `users/${userId}/boards/${boardId}/scene.json`;

        await env.BUCKET.put(
          r2Key,
          JSON.stringify({
            type: "excalidraw",
            version: 1,
            updatedAt: now,
            elements: [],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
            boardId,
          }),
          { httpMetadata: { contentType: "application/json" } }
        );

        await env.DB.prepare(
          `INSERT INTO board_scenes (board_id, user_id, r2_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(boardId, userId, r2Key, now, now)
          .run();

        return withCors(req, json({ ok: true, boardId }));
      }


      /**
 * PUT /boards/:id   { name }
 */
{
  const m = match(/^\/boards\/([^/]+)$/, path);
  if (m && req.method === "PUT") {
    const boardId = m[1];

    const body = await readJson<CreateBoardBody>(req);
    const name = safeString(body?.name).trim();

    if (!name) return withCors(req, badRequest("Missing name"));

    // Ensure board belongs to user
    const board = await env.DB.prepare(
      `SELECT id FROM boards WHERE id = ? AND user_id = ?`
    )
      .bind(boardId, userId)
      .first();

    if (!board) return withCors(req, notFound());

    const now = Date.now();

    await env.DB.prepare(
      `
      UPDATE boards
      SET name = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
      `
    )
      .bind(name, now, boardId, userId)
      .run();

    return withCors(req, json({ ok: true }));
  }
}


      /**
       * DELETE /boards/:id
       */
      {
        const m = match(/^\/boards\/([^/]+)$/, path);
        if (m && req.method === "DELETE") {
          const boardId = m[1];

          // Ensure board belongs to user
          const board = await env.DB.prepare(
            `SELECT id FROM boards WHERE id = ? AND user_id = ?`
          )
            .bind(boardId, userId)
            .first();

          if (!board) return withCors(req, notFound());

          const scene = await env.DB.prepare(
            `SELECT r2_key FROM board_scenes WHERE board_id = ? AND user_id = ?`
          )
            .bind(boardId, userId)
            .first<{ r2_key: string }>();

          if (scene?.r2_key) {
            await env.BUCKET.delete(scene.r2_key);
          }

          await env.DB.prepare(
            `DELETE FROM board_scenes WHERE board_id = ? AND user_id = ?`
          )
            .bind(boardId, userId)
            .run();

          await env.DB.prepare(`DELETE FROM boards WHERE id = ? AND user_id = ?`)
            .bind(boardId, userId)
            .run();

          return withCors(req, json({ ok: true }));
        }
      }

      /**
       * GET /boards/:id/scene
       */
      {
        const m = match(/^\/boards\/([^/]+)\/scene$/, path);
        if (m && req.method === "GET") {
          const boardId = m[1];

          // Ensure board belongs to user
          const board = await env.DB.prepare(
            `SELECT id FROM boards WHERE id = ? AND user_id = ?`
          )
            .bind(boardId, userId)
            .first();

          if (!board) return withCors(req, notFound());

          const scene = await env.DB.prepare(
            `SELECT r2_key FROM board_scenes WHERE board_id = ? AND user_id = ?`
          )
            .bind(boardId, userId)
            .first<{ r2_key: string }>();

          if (!scene?.r2_key) {
            return withCors(
              req,
              json({
                type: "excalidraw",
                version: 1,
                updatedAt: Date.now(),
                elements: [],
                appState: { viewBackgroundColor: "#ffffff" },
                files: {},
                boardId,
              })
            );
          }

          const obj = await env.BUCKET.get(scene.r2_key);
          if (!obj) return withCors(req, notFound());

          const text = await obj.text();
          return withCors(
            req,
            new Response(text, { headers: { "Content-Type": "application/json" } })
          );
        }
      }

      /**
       * PUT /boards/:id/scene
       */
      {
        const m = match(/^\/boards\/([^/]+)\/scene$/, path);
        if (m && req.method === "PUT") {
          const boardId = m[1];

          // Ensure board belongs to user
          const board = await env.DB.prepare(
            `SELECT id FROM boards WHERE id = ? AND user_id = ?`
          )
            .bind(boardId, userId)
            .first();

          if (!board) return withCors(req, notFound());

          const payload = await readJson<ExcalidrawScenePayload>(req);
          if (!payload) return withCors(req, badRequest("Invalid JSON"));

          // Minimal validation
          if (!Array.isArray(payload.elements)) {
            return withCors(req, badRequest("Invalid payload: elements must be an array"));
          }
          if (!isPlainObject(payload.appState)) {
            return withCors(req, badRequest("Invalid payload: appState must be an object"));
          }

          const now = Date.now();

          const existing = await env.DB.prepare(
            `SELECT r2_key FROM board_scenes WHERE board_id = ? AND user_id = ?`
          )
            .bind(boardId, userId)
            .first<{ r2_key: string }>();

          const r2Key = existing?.r2_key ?? `users/${userId}/boards/${boardId}/scene.json`;

          const stored = {
            type: "excalidraw",
            version: 1,
            updatedAt: now,
            boardId,

            elements: payload.elements,
            appState: payload.appState,
            files: isPlainObject(payload.files) ? payload.files : {},
          };

          await env.BUCKET.put(r2Key, JSON.stringify(stored), {
            httpMetadata: { contentType: "application/json" },
          });

          await env.DB.prepare(
            `
            INSERT INTO board_scenes (board_id, user_id, r2_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(board_id) DO UPDATE SET
              r2_key = excluded.r2_key,
              updated_at = excluded.updated_at
            `
          )
            .bind(boardId, userId, r2Key, now, now)
            .run();

          await env.DB.prepare(
            `UPDATE boards SET updated_at = ? WHERE id = ? AND user_id = ?`
          )
            .bind(now, boardId, userId)
            .run();

          return withCors(req, json({ ok: true }));
        }
      }

      return withCors(req, notFound());
    } catch (err: unknown) {
      return withCors(
        req,
        json(
          {
            ok: false,
            error: "Internal error",
            details: err instanceof Error ? err.message : String(err),
          },
          { status: 500 }
        )
      );
    }
  },
};
