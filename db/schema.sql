-- VecStack Chat — Postgres schema
-- Run once against your Neon (or local) database:
--   psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users (humans) ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL,
  email        TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Agents ─────────────────────────────────────────────────────────────────
-- An agent represents an AI persona. In the MVP one shared "claude" agent is
-- auto-created per room; step 6 will make these per-user.

CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID REFERENCES users(id) ON DELETE CASCADE,  -- nullable: shared agents have no single owner
  name            TEXT NOT NULL,                                 -- the @name handle
  system_prompt   TEXT NOT NULL,
  enabled_tools   TEXT[] NOT NULL DEFAULT '{}',
  enabled_skills  UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_name_idx ON agents(name);

-- ─── Rooms ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Room participation. Polymorphic: rows can reference either a user or an agent.
-- Exactly one of (user_id, agent_id) must be non-null.
CREATE TABLE IF NOT EXISTS room_participants (
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_id   UUID REFERENCES agents(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (agent_id IS NULL)),
  UNIQUE (room_id, user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS room_participants_room_idx ON room_participants(room_id);

-- ─── Messages ──────────────────────────────────────────────────────────────
-- content is the Anthropic ContentBlock[] shape:
--   [{ type:'text', text:'...' }, { type:'image', source:{...} },
--    { type:'tool_use', id, name, input }, { type:'tool_result', tool_use_id, content }]

CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_kind   TEXT NOT NULL CHECK (sender_kind IN ('human', 'agent', 'system')),
  sender_id     UUID NOT NULL,                          -- user_id or agent_id; no FK because polymorphic
  content       JSONB NOT NULL,                         -- ContentBlock[]
  reply_to      UUID REFERENCES messages(id),
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  recipient_id  UUID,                                   -- only set for visibility='private'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_room_created_idx ON messages(room_id, created_at);

-- ─── Skills (step 7) ────────────────────────────────────────────────────────
-- A skill is prompt + tool whitelist. NEVER executable code.

CREATE TABLE IF NOT EXISTS skills (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  input_schema    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- JSON Schema
  allowed_tools   TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

-- ─── Bootstrap: a shared "claude" agent and an "echo" agent ─────────────────
-- Idempotent: only inserts if not already present.

INSERT INTO agents (id, owner_id, name, system_prompt, enabled_tools)
VALUES (
  '00000000-0000-0000-0000-00000000c1ad'::uuid,
  NULL,
  'claude',
  'You are an AI participant in a multi-person chatroom. You can see all public messages from humans and other agents. You speak only when addressed by name. Be concise — chat-style, not essay-style. When you do not know something for sure, say so.',
  '{}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agents (id, owner_id, name, system_prompt)
VALUES (
  '00000000-0000-0000-0000-0000000000ec'::uuid,
  NULL,
  'echo',
  'echo bot — repeats what you say'
)
ON CONFLICT (id) DO NOTHING;
