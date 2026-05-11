# BUILD_PLAN.md — what to build, in what order

This scaffold implements **steps 1–3** of the plan. The remaining steps are queued up with Claude Code prompts you can copy-paste.

## ✅ Step 1 — Multi-user chatroom (no agents)

**Done.** Next.js client, Node `ws` server on Fly, Postgres-backed messages. Two browsers can chat in the same room.

Files:
- `apps/web/app/page.tsx`, `apps/web/app/room/[id]/page.tsx`
- `apps/room-server/src/index.ts`, `room/hub.ts`
- `db/schema.sql`

## ✅ Step 2 — Hardcoded echo agent

**Done.** `@echo <text>` causes a bot to reply with the text. Validates that agents are first-class room members.

Files:
- `apps/room-server/src/agent/echo.ts`
- `apps/room-server/src/room/dispatcher.ts` — mention parsing

## ✅ Step 3 — Real Claude agent

**Done.** `@claude <prompt>` invokes `claude-sonnet-4-6` with the room history as context. No tools yet — pure text.

Files:
- `apps/room-server/src/agent/loop.ts`
- `apps/room-server/src/agent/context.ts`
- `apps/room-server/src/agent/registry.ts`

---

## ⏭ Step 4 — Image generation tools

**Goal:** `@claude draw a labubu wearing sunglasses` produces an image in the room.

Tools to add:
- `generate_image(prompt: string)` → returns image URL
- `edit_image(image_url: string, instruction: string)` → returns image URL

**Prompt for Claude Code:**

> Implement `generate_image` and `edit_image` tools in `apps/room-server/src/tools/images.ts`. Use fal.ai's REST API — `FLUX.1 [schnell]` for generation and `FLUX.1 Kontext` for editing. Read `FAL_API_KEY` from env. Upload result to Cloudflare R2 (read R2 creds from env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`). Return the public URL. Register the tools in `apps/room-server/src/tools/index.ts`. The agent loop already handles `tool_use` blocks — make sure tool results are broadcast as `ContentBlock[]` with both `text` ("Generated image:") and `image` (the URL) blocks so the UI renders them. Read `AGENTS.md` § "Tool results are public" first.

## ⏭ Step 5 — Web search + browser

**Goal:** `@claude what did Alibaba launch last week?` searches the web and summarizes.

Tools to add:
- `web_search(query: string)` → list of {title, url, snippet}
- `browse(url: string)` → page text content

**Prompt for Claude Code:**

> Implement `web_search` and `browse` tools using Browserbase. Read `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` from env. For `web_search`, use Browserbase's session API to navigate to a search engine, extract results. For `browse`, navigate and return readable text (strip nav/footer/ads). Cache search results in Upstash Redis for 1 hour keyed on query. Add to `apps/room-server/src/tools/index.ts`. Be defensive: Browserbase sessions can fail — wrap in try/catch and return a `tool_result` block with `is_error: true` and an error message string on failure.

## ⏭ Step 6 — Multi-agent (per-user agents) + private commands

**Goal:** User A has their own agent "Alice-bot"; User B has "Bob-bot". They don't interfere. Users can DM their own agent.

**Prompt for Claude Code:**

> Today there's one agent per room. Refactor to one agent per user. Changes: (1) add `agents` table queries to `apps/room-server/src/storage/agents.ts` — load all agents whose owners are in the room; (2) `parseMentions()` in `room/dispatcher.ts` must resolve `@name` to a specific agent_id by matching against the agents loaded for this room; (3) when a message has `visibility='private'` and `recipient_id` is the user's own agent, route it to that agent's context but DO NOT broadcast publicly — only echo back to the sender; (4) the agent's reply to a private command also stays private (visible only to its owner). UI work: add a "/private" or "shift+enter" toggle in `apps/web/components/MessageInput.tsx` to mark a message private. Read `AGENTS.md` § "Private channel" first.

## ⏭ Step 7 — Skill system

**Goal:** `@claude create a skill called "competitor-recon" that takes a company name, searches the web for their recent product launches, and summarizes`. Then later: `@claude run competitor-recon on Alibaba`.

**Prompt for Claude Code:**

> Implement two tools in `apps/room-server/src/tools/skills.ts`: `create_skill` and `invoke_skill`. A skill is a row in the `skills` table with: name, description, prompt_template (with `{{var}}` placeholders), input_schema (JSON Schema), allowed_tools (string[]). `create_skill` writes a row; `invoke_skill` loads a skill by name, validates inputs against its schema, fills the template, then runs a *nested* agent loop with ONLY the skill's `allowed_tools` available. The nested loop must NOT have access to `create_skill` (no recursion). Read `AGENTS.md` § "Skills are prompt + tool whitelist, not code" first — under no circumstances should a skill execute arbitrary code.

---

## Deploying

### One-time setup

1. **Neon Postgres** — sign up, create a database, copy the connection string.
2. **Fly.io** — `flyctl auth signup`, then in `apps/room-server/`: `flyctl launch --no-deploy` (it'll detect the Dockerfile). Don't accept the offered Postgres — we're using Neon.
3. **Vercel** — `vercel link` from `apps/web/`.
4. **Secrets** — set on Fly:
   ```bash
   flyctl secrets set ANTHROPIC_API_KEY=sk-ant-...
   flyctl secrets set DATABASE_URL=postgresql://...
   ```
   And on Vercel (dashboard or `vercel env add`):
   - `NEXT_PUBLIC_WS_URL=wss://YOUR-APP.fly.dev`

### CI/CD

The `.github/workflows/deploy.yml` triggers on push to `main`:
- Builds & deploys `apps/web` to Vercel (needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` repo secrets)
- Builds & deploys `apps/room-server` to Fly (needs `FLY_API_TOKEN` repo secret)
