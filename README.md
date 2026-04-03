# Excali-Draw

A **stateful Excalidraw clone** built with **Cloudflare R2 + D1**, designed for fast, persistent, multi-board sketching.

Built for simplicity, performance, and real-world use — not just a demo.

## Features

- Persistent drawings (no data loss)
- Cloud storage via **R2**
- Metadata + state via **D1**
- Authentication-ready (Clerk-compatible)
- Fast load + save cycles
- Multi-board support

## Demo

https://github.com/user-attachments/assets/97a81cc9-e79b-43c1-a934-35f47e5b7405

---

## Deploy

### Frontend (Vercel)

> Deploy the `frontend/` directory

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

After importing:
- Set **Root Directory** → `frontend`

You'll need to create a CLERK account and get keys to be able to deploy the next.js frontend
[https://clerk.com/](https://clerk.com/)

---

### Backend (Cloudflare Workers)

> Deploy the `excali-cloud/` directory

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com)

After importing:
- Set **Root Directory** → `excali-cloud`

---

## Local Development

```bash
pnpm install

# frontend
pnpm --filter frontend dev

# backend
pnpm --filter excali-cloud dev
```

Built with <3 

