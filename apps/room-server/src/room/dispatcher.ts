import type { Message } from '@vecstack/shared';
import type { Room } from './hub.js';
import { runEchoAgent } from '../agent/echo.js';
import { runClaudeAgent } from '../agent/loop.js';

/**
 * Given an incoming message and the list of @-mentioned names, find the
 * matching agents in the room and invoke each one. Each agent's response
 * is broadcast independently as it arrives.
 *
 * Per AGENTS.md § "Agents only act when @-mentioned", this is the ONLY
 * trigger path. Don't add ambient/auto-replies here without revisiting that
 * decision.
 */
export async function dispatchToAgents(
  room: Room,
  triggerMessage: Message,
  mentions: string[]
): Promise<void> {
  const seen = new Set<string>();
  for (const name of mentions) {
    if (seen.has(name)) continue;
    seen.add(name);

    const agent = room.findAgentByName(name);
    if (!agent) continue; // mention of a non-agent (could be another user) — ignore

    // Run agents in parallel; each writes its own messages to DB & broadcasts.
    void invokeAgent(room, agent.id, agent.name, triggerMessage).catch((err) => {
      console.error(`[dispatch] agent ${name} failed`, err);
    });
  }
}

async function invokeAgent(
  room: Room,
  agentId: string,
  agentName: string,
  triggerMessage: Message
): Promise<void> {
  // Signal "thinking" so the UI can show a typing indicator
  room.broadcast({ type: 'agent_thinking', agentId, agentName });

  // Built-in agents are dispatched by name; future agents (per-user) will be
  // dispatched generically via the agent loop using their system_prompt and
  // tool whitelist from the DB.
  switch (agentName.toLowerCase()) {
    case 'echo':
      await runEchoAgent(room, agentId, triggerMessage);
      return;
    case 'claude':
    default:
      await runClaudeAgent(room, agentId, triggerMessage);
      return;
  }
}
