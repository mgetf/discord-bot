import { type AgentTool, defineTool, json } from '@/agent/tools/shared';

async function getServerInfo(
  _input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const { guild } = ctx;
  return json({
    id: guild.id,
    name: guild.name,
    description: guild.description,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    createdAt: guild.createdAt.toISOString(),
    premiumTier: guild.premiumTier,
    verificationLevel: guild.verificationLevel,
    nsfwLevel: guild.nsfwLevel,
    features: guild.features,
    icon: guild.iconURL(),
    banner: guild.bannerURL(),
    vanityURLCode: guild.vanityURLCode,
    preferredLocale: guild.preferredLocale
  });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'get_server_info',
      'Get detailed discord server information',
      {
        guildId: { type: 'string', description: 'Discord server ID' }
      }
    ),
    run: getServerInfo
  }
];
