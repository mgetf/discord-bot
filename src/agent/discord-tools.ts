import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { tools as categoryTools } from '@/agent/tools/categories';
import { tools as channelTools } from '@/agent/tools/channels';
import { tools as emojiTools } from '@/agent/tools/emojis';
import { tools as eventTools } from '@/agent/tools/events';
import { tools as forumTools } from '@/agent/tools/forums';
import { tools as inviteTools } from '@/agent/tools/invites';
import { tools as messageTools } from '@/agent/tools/messages';
import { tools as moderationTools } from '@/agent/tools/moderation';
import { tools as overwriteTools } from '@/agent/tools/overwrites';
import { tools as roleTools } from '@/agent/tools/roles';
import { tools as serverTools } from '@/agent/tools/server';
import {
  type AgentTool,
  json,
  rejectForeignGuild,
  summarizeArgs,
  type ToolContext
} from '@/agent/tools/shared';
import { tools as userTools } from '@/agent/tools/users';
import { tools as voiceTools } from '@/agent/tools/voice';
import { tools as webhookTools } from '@/agent/tools/webhooks';
import { logger } from '@/utils/logger';

export type { ToolContext };

const log = logger.child({ name: 'agent/discord-tools' });

const ALL_TOOLS: AgentTool[] = [
  ...serverTools,
  ...messageTools,
  ...channelTools,
  ...categoryTools,
  ...roleTools,
  ...moderationTools,
  ...overwriteTools,
  ...voiceTools,
  ...eventTools,
  ...inviteTools,
  ...webhookTools,
  ...forumTools,
  ...emojiTools,
  ...userTools
];

const TOOLS_BY_NAME = new Map(ALL_TOOLS.map((tool) => [tool.spec.name, tool]));

export const AGENT_TOOLS: Tool[] = ALL_TOOLS.map((tool) => tool.spec);

export function agentToolNames(): string[] {
  return ALL_TOOLS.map((tool) => tool.spec.name);
}

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const foreign = rejectForeignGuild(ctx, input);
  if (foreign) return foreign;

  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return json({ error: `Unknown tool: ${name}` });

  log.info(
    {
      tool: name,
      args: summarizeArgs(input),
      requesterTag: ctx.requesterTag,
      guildId: ctx.guild.id
    },
    'Agent tool execute'
  );

  try {
    return await tool.run(input, ctx);
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
