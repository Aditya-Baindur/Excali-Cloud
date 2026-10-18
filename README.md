# ExcaliCloud

A persistent Excalidraw workspace built with Next.js, Clerk, Cloudflare Workers, D1, and R2.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FAditya-Baindur%2Fdraw.adityabaindur.dev)

Deploy the **entire application** from the repository root: the Next.js frontend and API run in one Worker, with a new D1 database and R2 bucket in your account. The deploy step creates the database tables automatically.

## Features

- A clean, responsive dashboard with search, sorting, grid/list views, and board management.
- Account-saved folders organize boards. Create or rename folders, move boards, and browse All boards or Unfiled. Removing a folder keeps its boards. Folder names also work in global ⌘K search.
- One-click **Share** on a board or the dashboard creates a view-only public link and copies it. The editor saves pending changes first. Clipboard fallback lets you copy manually.
- **Manage shares** at `/admin/shares` lists your active and revoked links. Revoke access at any time; sharing again creates a fresh link. Public links display the latest saved board when opened or refreshed.
- **Insert video** in the editor menu uploads MP4, WebM, and Ogg clips (up to 50 MiB each) directly onto the canvas. Move, resize, play, and seek videos in place; placements save with the board and play in public shares. Existing uploads can be inserted again, and undoing/removing a placement keeps its media available. Playback depends on the browser's codec support; image exports show an embed placeholder.
- Autosave, explicit save, and visible error/retry states. Board ownership is verified with Clerk session JWTs.

## Local development

### Full app on Cloudflare

Use Node.js 22.12 or newer. From the repository root, run `npm ci` and `npm run build`. Copy `.dev.vars.example` to `.dev.vars`, then add your Clerk publishable key alongside the secret key:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Run `npm run db:migrate:local` and `npm run dev`, then open `http://localhost:3000`. D1 and R2 are simulated locally. The existing two-process development setup is also available below.

### Separate frontend and backend

Install each app's dependencies:

```sh
cd frontend
pnpm install --frozen-lockfile
cd ../excali-cloud
npm ci
```

### Backend

Copy `excali-cloud/.dev.vars.example` to `.dev.vars`. Set `CLERK_ISSUER` to your Clerk frontend API origin, such as `https://your-instance.clerk.accounts.dev`. It must match the JWT issuer exactly. Public JWKS verification is used by default; `CLERK_JWT_KEY` optionally supplies the Clerk PEM public key. Set `CLERK_AUTHORIZED_PARTIES` to your app origins, including `http://localhost:3000` for development.

Initialize local D1, then start the Worker:

```sh
cd excali-cloud
npx wrangler d1 execute excali_cloud_db --local --file=migrations/0001_schema.sql
npx wrangler d1 execute excali_cloud_db --local --file=migrations/0002_shares_and_videos.sql
npx wrangler d1 execute excali_cloud_db --local --file=migrations/0003_board_folders.sql
npm run dev
```

Development bindings use local D1 and R2. `ALLOW_DEMO_AUTH=true` enables only the explicit shared demo identities `PUBLIC-USER` and `demo-user`; it never accepts an arbitrary account ID. Set it to `false` if you do not want the legacy public demo workspace. Personal boards always require a valid Clerk token.

### Frontend

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_BASE=http://localhost:8787
NEXT_PUBLIC_USE_ANALYTICS=false
```

```sh
cd frontend
npm run dev
```

Open `http://localhost:3000` and sign in. Public `/share/[token]` links do not require sign-in. All share management is scoped to the signed-in owner's account.

## Deployment

### One-click full app deployment

1. Click **Deploy to Cloudflare** above and select your Cloudflare account and Git repository destination.
2. Enter your Clerk application's matching `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in the setup screen. Clerk accounts are external to Cloudflare; get these from [Clerk API keys](https://dashboard.clerk.com/last-active?path=api-keys). Cloudflare stores the secret key as a Worker secret.
3. Accept the database and bucket names, and enable R2 if Cloudflare prompts you. Keep **Root directory** at the repository root, **Build command** at `npm run build`, and **Deploy command** at `npm run deploy`.
4. Open the resulting `workers.dev` URL. If your Clerk instance restricts application origins, add this URL in Clerk. Production Clerk instances may require your own domain and Clerk's production domain setup.

Cloudflare clones the repository, provisions D1 and R2, and writes the new resource identifiers into the root `wrangler.jsonc`. The deployment uses the `DB` binding, so custom database names work. Numbered migrations initialize tables before the Worker is published and are skipped on subsequent deployments. This uses Cloudflare's [Deploy button provisioning flow](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

The frontend is built with vinext for Workers. Pages, authenticated API requests, scenes, and video uploads share the deployment's origin; no API hostname, CORS edits, custom domain, or second deployment is required. The API derives its Clerk issuer from the publishable key and accepts session tokens for the current app origin. The **Try demo** workspace is shared and publicly editable; set `ALLOW_DEMO_AUTH=false` during setup to disable it. Personal boards always require sign-in. Analytics are disabled in the Cloudflare build.

After the first button deployment, subsequent pushes to the generated repository use the same build and deploy commands. To deploy that clone locally, use `npm ci`, `npm run build`, and `npm run deploy`. `npm run deploy:check` checks the built Worker without changing remote resources. The unprovisioned source template contains a placeholder database ID; the button replaces it before running migrations.

The button reads the **published GitHub repository**, so local changes must be pushed before they are available to people clicking it.

### Existing Vercel + API deployment

The existing split deployment remains available: deploy `frontend/` to Vercel and `excali-cloud/` to Cloudflare Workers using that directory's config. Set the frontend's Clerk variables and `NEXT_PUBLIC_API_BASE` to the Worker origin. An optional server-only `API_BASE` can override the proxy target; both URLs must address the same Worker.

Before deploying this update to an existing database, apply the additive migrations:

```sh
cd excali-cloud
npx wrangler d1 execute excali_cloud_db --remote --file=migrations/0002_shares_and_videos.sql
npx wrangler d1 execute excali_cloud_db --remote --file=migrations/0003_board_folders.sql
```

For a new database, apply `migrations/0001_schema.sql` first. Existing boards and scenes are preserved. Configure `CLERK_ISSUER` and `CLERK_AUTHORIZED_PARTIES` on the deployed Worker; never put the Clerk secret key in browser code or the Worker config. If using `CLERK_JWT_KEY`, store it with `wrangler secret put CLERK_JWT_KEY`. Then deploy the Worker and frontend together, since the old personal API relied on unverified user ID headers.

Add any custom frontend origin to the Worker's CORS allowlist in `src/index.ts` as well as `CLERK_AUTHORIZED_PARTIES`. Scene writes and video uploads go directly to the Worker with a Clerk bearer token, avoiding the frontend host's request body limit. Metadata and authenticated video playback use a same-origin streaming proxy. Revoked share tokens are checked for every new public scene and video request; previously downloaded content cannot be recalled.

## Verification

```sh
npm ci
npm test
npm run build
npm run deploy:check
cd excali-cloud
npm ci
npm test -- --run
npx tsc --noEmit
cd ../frontend
npm run typecheck:cloudflare
npm test
npm run lint
```

Worker tests use isolated local D1/R2 with generated test signing keys. They cover authentication, ownership, folder organization and deletion without losing boards, share creation/reuse/revocation, video streaming/ranges, upload limits, and cleanup without accessing production data.
