import type Anthropic from '@anthropic-ai/sdk';

type ToolDefinition = Anthropic.Tool;

export interface ToolContext {
  roomId: string;
  agentId: string;
}

export interface ToolHandler {
  definition: ToolDefinition;
  execute: (input: any, ctx: ToolContext) => Promise<unknown>;
}

/**
 * Tool registry. Add new tools here. Each entry is keyed by the tool name
 * that Claude will see and reference in its tool_use blocks.
 *
 * Step 3 has no tools — Claude is pure-text. Steps 4–7 wire in:
 *   - generate_image / edit_image  → apps/room-server/src/tools/images.ts
 *   - web_search / browse          → apps/room-server/src/tools/web.ts
 *   - create_skill / invoke_skill  → apps/room-server/src/tools/skills.ts
 */
const REGISTRY: Record<string, ToolHandler> = {
  // Stub examples Claude Code should replace in step 4:
  //
  // generate_image: {
  //   definition: {
  //     name: 'generate_image',
  //     description: 'Generate a new image from a text prompt.',
  //     input_schema: {
  //       type: 'object',
  //       properties: { prompt: { type: 'string' } },
  //       required: ['prompt'],
  //     },
  //   },
  //   execute: async (input, ctx) => generateImage(input.prompt),
  // },
};

/** Resolve a list of tool names to Anthropic tool definitions. */
export function resolveTools(enabledTools: string[]): ToolDefinition[] {
  return enabledTools
    .map((name) => REGISTRY[name]?.definition)
    .filter((d): d is ToolDefinition => Boolean(d));
}

/** Execute a tool call by name. Throws if the tool is not registered. */
export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext
): Promise<unknown> {
  const handler = REGISTRY[name];
  if (!handler) throw new Error(`Tool not registered: ${name}`);
  return handler.execute(input, ctx);
}

export function registerTool(name: string, handler: ToolHandler): void {
  REGISTRY[name] = handler;
}
