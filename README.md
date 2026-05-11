# VecStack Chat — agent-in-the-room MVP

A web chatroom where humans and their agents are co-participants. This repo is the **MVP scaffold** built end-to-end in one go (steps 1–3 of the build plan in `BUILD_PLAN.md`).

## What's working in this scaffold

- Multi-user WebSocket chatroom (humans only)
- Hardcoded `echo` agent that joins every room
- Real Claude agent (`claude-sonnet-4-6`) that responds when `@`-mentioned
- Postgres-backed message persistence
- Next.js frontend on Vercel
- Node room-server on Fly.io
- GitHub Actions deploys both

## What's NOT in this scaffold (next steps)

These are deferred to keep step 1–3 shippable. Pick them up in this order:

1. **Tools — image generation/edit** (`apps/room-server/src/tools/images.ts` stub) via fal.ai
2. **Tools — web search & browse** via Browserbase
3. **Multi-agent isolation** — currently one agent per room; expand to one agent per user
4. **Skill registry** — `create_skill` and `invoke_skill` tools backed by Postgres

See `BUILD_PLAN.md` for the full roadmap and `AGENTS.md` for the design decisions baked in.

## Repo layout

```
vecstack-chat/
├── apps/
│   ├── web/             # Next.js — chat UI, deployed to Vercel
│   └── room-server/     # Node + ws — room actors, deployed to Fly.io
├── packages/
│   └── shared/          # Shared types (Message, Agent, Skill, etc.)
├── db/
│   └── schema.sql       # Postgres schema, run against Neon
├── .github/workflows/   # CI/CD
└── BUILD_PLAN.md        # Step-by-step roadmap with Claude Code prompts
```

## Quick start (local)

```bash
# 1. Install deps (uses npm workspaces; pnpm also works)
npm install

# 2. Set up Postgres (Neon free tier, then run schema)
export DATABASE_URL='postgresql://...'
psql "$DATABASE_URL" -f db/schema.sql

# 3. Set Anthropic key
export ANTHROPIC_API_KEY='sk-ant-...'

# 4. Start room server
npm --workspace apps/room-server run dev
# → ws://localhost:8080

# 5. In another terminal, start the web app
npm --workspace apps/web run dev
# → http://localhost:3000
```

Open two browser windows at http://localhost:3000, join the same room, and chat. `@echo` to ping the echo bot. `@claude` to invoke the real LLM agent.

## Deploy

See `BUILD_PLAN.md` § "Deploying". The short version:

- **Web** → `vercel --prod` from `apps/web/` (or merge to `main`; GitHub Action handles it)
- **Room server** → `flyctl deploy` from `apps/room-server/` (or merge to `main`)
- **DB** → Neon dashboard; run `db/schema.sql` once

## Design principles baked into this code

See `AGENTS.md` for full reasoning. TL;DR:

- Agents are room members, not reply boxes — they appear in the participants list and broadcast publicly.
- Agents only act when `@`-mentioned (in this MVP). No auto-chatter.
- One agent persona shared by the room; per-user agents come later.
- All agent tool results are visible to everyone in the room.
- Message schema mirrors Anthropic API `ContentBlock[]` so room history slots straight into Claude context.
