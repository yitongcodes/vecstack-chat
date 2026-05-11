/**
 * Step 7 stub — create_skill and invoke_skill.
 *
 * Per AGENTS.md § "Skills are prompt + tool whitelist, not code", skills
 * are NEVER executable code. They are:
 *   - A prompt template with {{var}} placeholders
 *   - An input JSON Schema
 *   - A whitelist of tools the skill is allowed to use when invoked
 *
 * invoke_skill runs a nested agent loop with ONLY the skill's allowed_tools
 * available. The nested loop must NOT include create_skill itself to prevent
 * recursive skill creation.
 *
 * See BUILD_PLAN.md step 7 for the full prompt.
 */

export {};
