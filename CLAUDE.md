# CLAUDE.md — Claude Code reading order and conventions

This file is for Claude Code (and other AI coding assistants). It says how to navigate this repo and what conventions to preserve.

## Read these in order before changing anything

1. `README.md` — what this project is
2. `AGENTS.md` — **design contract**; do not violate these without explicit user instruction
3. `BUILD_PLAN.md` — what's done, what's next, and per-step prompts
4. `packages/shared/src/index.ts` — the data model and WS protocol
5. `apps/room-server/src/agent/loop.ts` — the agent loop
6. `apps/room-server/src/room/hub.ts` — the room actor

## Conventions to preserve

- **Workspaces:** This is an npm workspace monorepo. `npm install` at the root installs everything. Don't add a lockfile inside a sub-package.
- **Shared types:** All cross-app types live in `packages/shared/src/index.ts`. If you find yourself redeclaring `Message` or `ContentBlock` anywhere else, stop and import from `@vecstack/shared` instead.
- **`Message.content` is always `ContentBlock[]`** matching Anthropic SDK shape. Don't add parallel "text" fields.
- **Agent triggers:** Only `@`-mentions trigger an agent. Don't add ambient triggers (e.g. "agent replies when keyword X appears") without first updating `AGENTS.md`.
- **No agent logic in `apps/web`.** The web app is a thin client. All agent work happens in `apps/room-server`.
- **No browser code in `apps/room-server`.** It's a Node server. Use Browserbase for any real browser work.
- **Tools go in `apps/room-server/src/tools/`** and are registered via `registerTool()` from `tools/index.ts`. The agent loop calls `executeTool()`; don't bypass it.
- **TypeScript strict mode is on everywhere.** Don't loosen it; fix the type instead.

## How to run

```bash
npm install
psql "$DATABASE_URL" -f db/schema.sql       # one time
npm run dev:server                           # ws://localhost:8080
npm run dev:web                              # http://localhost:3000
```

## How to test changes locally

1. Open two browser windows at http://localhost:3000.
2. Join the same room with two different names.
3. Send a message from window A — appears in window B.
4. Send `@echo hello` — echo bot replies in both windows.
5. Send `@claude hi` — Claude replies (requires `ANTHROPIC_API_KEY`).

## How to deploy

Push to `main`. The GitHub Action handles Fly + Vercel. See `BUILD_PLAN.md` § "Deploying" for one-time secret setup.

## When extending

- For a new tool, read `BUILD_PLAN.md` for the exact step's prompt. The prompts are written so you can paste each one back into Claude Code as the user instruction for that step.
- For schema changes, **always write a forward-compatible migration**. Don't edit `db/schema.sql` in place after first deploy; add a new file like `db/2026-05-15-add-thing.sql`.
- For new env vars, add them to `.env.example` AND to the `flyctl secrets set` / Vercel env section of `BUILD_PLAN.md`.

## Things that look wrong but are intentional

- `Message.senderId` has no FK because it's polymorphic (user_id or agent_id). The `CHECK` constraint is on `room_participants` instead.
- The `claude` and `echo` agents have hardcoded UUIDs (`...c1ad` and `...00ec`) in `db/schema.sql`. This is deliberate so the same agent IDs exist across all environments.
- `apps/room-server/src/tools/index.ts` is mostly empty. Tools are added in steps 4–7.
- The web app uses `app/room/[id]/page.tsx` even though there's no auth — userId is generated client-side and stored in localStorage. Real auth is a future step; not in scope for the MVP.
