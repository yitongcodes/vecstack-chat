# AGENTS.md — design contract for VecStack Chat

This file documents the **product physics** decisions that shape the codebase. Read this before extending the agent system; the architecture only makes sense if these are preserved.

## Core idea

A chatroom where each human user has a paired agent. Both are first-class participants — they share the message stream, they're both listed in the room roster, and tool calls (image generation, web search, skill invocation) are visible to everyone in the room.

This is NOT a chatbot-in-a-sidebar product. The agent is *in* the room.

## Decisions baked in (don't change without thinking)

### 1. Agents only act when `@`-mentioned

In this MVP, an agent never speaks on its own. It triggers only when its name (`@claude`, `@echo`) appears in a message.

**Why:** Multi-agent rooms have a failure mode where agents respond to each other and create runaway loops. Mention-only is the safe default. Once we have rate limiting + a `quiet()` tool the agent can call on itself, we can relax this.

**Where enforced:** `apps/room-server/src/room/dispatcher.ts` — `parseMentions()` is the gate.

### 2. Agents see the full public stream

When an agent is invoked, its context window is built from **all public messages** in the room (truncated to last N), regardless of who sent them. Other agents' messages are visible.

**Why:** The agent represents its owner *in a conversation*. Pretending it can only see its owner's messages would make it useless ("what were they just talking about?").

**Where enforced:** `apps/room-server/src/agent/context.ts` — `buildContext()`.

### 3. Tool results are public

When the agent calls `generate_image` or any other tool, both the tool call and its result are broadcast to the room as messages from the agent. Everyone sees the image.

**Why:** The whole point of the agent being in the room is that other participants see what it does. Hidden tool output would be a chatbot-in-a-sidebar pattern.

**Where enforced:** `apps/room-server/src/agent/loop.ts` — `broadcastToolResults()`.

### 4. Private channel for owner→agent commands (not yet implemented)

The owner can send instructions to *their* agent that don't appear in the room ("draft a counter-offer to user B's last message"). This is a private DM channel.

**Status:** Schema supports it (`messages.visibility = 'private'`, `messages.recipient_id`), but UI not wired. See `BUILD_PLAN.md` step 6.

### 5. Skills are prompt + tool whitelist, not code

A skill is a stored prompt template with a list of tools it's allowed to use. **Skills never contain executable code.** This keeps sandboxing trivial — no eval, no dynamic imports.

**Where enforced:** `apps/room-server/src/tools/skills.ts` (stubbed; full impl in step 7).

### 6. Message schema mirrors Anthropic ContentBlock

A `Message.content` is `ContentBlock[]` exactly as the Anthropic SDK expects: `{ type: 'text' | 'image' | 'tool_use' | 'tool_result', ... }`. Room history can be passed to `anthropic.messages.create` with no transformation.

**Where enforced:** `packages/shared/src/types.ts` — `Message` and `ContentBlock`.

**Implication:** Don't add fields like `Message.text` that duplicate `content`. If you need a display string, derive it.

## Naming

- **User** = human, has an email, owns one or more agents.
- **Agent** = AI persona that joins rooms. Has a name, system prompt, tool whitelist.
- **Room** = chatroom. Has participants (users + agents) and a message log.
- **Skill** = stored prompt + tool whitelist, invokable as a single tool call. Skills belong to a user.

## Files Claude Code should read in order

1. `README.md` — high-level
2. `AGENTS.md` — this file, design decisions
3. `BUILD_PLAN.md` — what to build next
4. `packages/shared/src/types.ts` — the data model
5. `apps/room-server/src/agent/loop.ts` — the agent loop itself
6. `apps/room-server/src/room/hub.ts` — the room actor

## Things that will tempt you but you shouldn't do

- **Don't add WhatsApp/Telegram channels.** The product is web-first. OpenClaw does this; we don't.
- **Don't run Chrome inside the room-server container.** Use Browserbase. Chrome is ~500MB resident and adds an attack surface we don't want.
- **Don't store images in Postgres.** Use Cloudflare R2; store the URL in the message.
- **Don't make skills executable.** Prompt + tool whitelist only. The moment a skill can `eval` arbitrary code, the trust model collapses.
- **Don't put agent logic in Next.js API routes.** Serverless timeout will kill long agent turns. All agent work lives in `apps/room-server`.
