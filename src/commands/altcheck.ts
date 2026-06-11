import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';
import { env } from '@/env';
import type { Command } from '@/types';
import { logger } from '@/utils/logger';
import {
  type AltCandidate,
  normaliseSteamId,
  type RegionCreds,
  type RegionResult,
  runAltCheck
} from '@/utils/whois';

const log = logger.child({ name: 'commands/altcheck' });

function parseRegionCreds(raw: string, name: string): RegionCreds | null {
  const parts = raw.split(':');
  if (parts.length < 3) return null;
  const host = parts[0];
  const port = Number(parts[1]);
  const password = parts.slice(2).join(':');
  if (!host || Number.isNaN(port) || !password) return null;
  return { name, host, port, password };
}

function verdictEmoji(v: AltCandidate['verdict']): string {
  switch (v) {
    case 'CONFIRMED ALT':
      return '🔴';
    case 'LIKELY ALT':
      return '🟠';
    case 'POSSIBLE ALT':
      return '🟡';
    case 'WEAK SIGNAL':
      return '🔵';
    case 'LOW SIGNAL':
      return '⚪';
  }
}

function topVerdict(regions: RegionResult[]): AltCandidate['verdict'] | null {
  const all = regions.flatMap((r) => r.candidates);
  if (all.length === 0) return null;
  const order: AltCandidate['verdict'][] = [
    'CONFIRMED ALT',
    'LIKELY ALT',
    'POSSIBLE ALT',
    'WEAK SIGNAL',
    'LOW SIGNAL'
  ];
  return order.find((v) => all.some((c) => c.verdict === v)) ?? null;
}

function embedColor(v: AltCandidate['verdict'] | null): number {
  switch (v) {
    case 'CONFIRMED ALT':
      return 0xed4245;
    case 'LIKELY ALT':
      return 0xff7b00;
    case 'POSSIBLE ALT':
      return 0xfee75c;
    case 'WEAK SIGNAL':
      return 0x5865f2;
    default:
      return 0x57f287;
  }
}

function candidateField(c: AltCandidate): { name: string; value: string } {
  const ipLines = c.sharedIps
    .slice(0, 4)
    .map((i) => {
      const excl = i.accounts === 1 ? ' ← exclusive' : ` (${i.accounts} accs)`;
      return `\`${i.ip}\` ${i.label}${excl}`;
    })
    .join('\n');

  const extras: string[] = [];
  if (c.temporalOverlaps > 0)
    extras.push(`${c.temporalOverlaps} IP(s) used within 72h of each other`);
  if (c.copresences > 0)
    extras.push(`${c.copresences} server session overlap(s)`);

  const lines = [
    `**Score:** ${c.score}%  |  **Activity:** ${c.firstSeen} → ${c.lastSeen}  (${c.connections} entries)`,
    c.names.length > 0 ? `**Names:** ${c.names.join(', ')}` : null,
    `**Shared IPs:**\n${ipLines}`,
    extras.length > 0 ? extras.join(' · ') : null
  ]
    .filter(Boolean)
    .join('\n');

  return {
    name: `${verdictEmoji(c.verdict)} ${c.steamId}  —  ${c.verdict}`,
    value: lines.slice(0, 1024)
  };
}

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('altcheck')
    .setDescription(
      'Cross-reference all whois databases for potential alt accounts of a Steam ID.'
    )
    .addStringOption((o) =>
      o
        .setName('steam_id')
        .setDescription(
          'Steam ID in any format: STEAM_0:Y:W, [U:1:N], or 76561198xxxxxxxxx'
        )
        .setRequired(true)
    ),

  execute: async (interaction) => {
    if (
      env.ALTCHECK_CHANNEL_ID &&
      interaction.channelId !== env.ALTCHECK_CHANNEL_ID
    ) {
      await interaction.reply({
        content: `This command can only be used in <#${env.ALTCHECK_CHANNEL_ID}>.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const rawInput = interaction.options.getString('steam_id', true);

    const target = normaliseSteamId(rawInput);
    if (!target) {
      await interaction.reply({
        content: `Could not parse \`${rawInput}\`.\nAccepted formats: \`STEAM_0:0:12345\` · \`[U:1:12345]\` · \`76561198xxxxxxxxx\``,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Build list of configured regions
    const regionMap: Array<[string | undefined, string]> = [
      [env.WHOIS_DB_NA, 'North America'],
      [env.WHOIS_DB_EU, 'Europe'],
      [env.WHOIS_DB_ASIA, 'Asia']
    ];
    const regions: RegionCreds[] = regionMap
      .filter(([val]) => Boolean(val))
      .map(([val, name]) => parseRegionCreds(val as string, name))
      .filter((r): r is RegionCreds => r !== null);

    if (regions.length === 0) {
      await interaction.reply({
        content:
          'No whois databases are configured. Set `WHOIS_DB_NA`, `WHOIS_DB_EU`, or `WHOIS_DB_ASIA` in the bot environment.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply();

    let result: Awaited<ReturnType<typeof runAltCheck>>;

    try {
      result = await runAltCheck(regions, rawInput);
    } catch (err) {
      log.error({ err }, 'altcheck failed');
      await interaction.editReply(
        'Analysis failed — check bot logs for details.'
      );
      return;
    }

    const { regions: regionResults } = result;
    const totalRecords = regionResults.reduce((s, r) => s + r.records, 0);
    const allCandidates = regionResults.flatMap((r) => r.candidates);
    const notable = allCandidates.filter((c) => c.score >= 20 || c.confirmed);
    const sdrRegions = regionResults.filter((r) => r.sdr).map((r) => r.name);
    const errors = regionResults
      .filter((r) => r.error)
      .map((r) => `${r.name}: ${r.error}`);

    const top = topVerdict(regionResults);
    const color = embedColor(top);

    // Summary embed
    const summaryLines: string[] = [];

    for (const r of regionResults) {
      if (r.error) {
        summaryLines.push(`**${r.name}** — ❌ connection error`);
        continue;
      }
      if (r.records === 0) {
        summaryLines.push(`**${r.name}** — no records`);
        continue;
      }

      const ipSummary = r.ips
        .slice(0, 3)
        .map((i) => `\`${i.ip}\` (${i.label})`)
        .join(', ');
      const more = r.ips.length > 3 ? ` +${r.ips.length - 3} more` : '';
      const sdrNote = r.sdr ? ' · ⚠️ SDR' : '';
      summaryLines.push(
        `**${r.name}** — ${r.records} entries · ${ipSummary}${more}${sdrNote}`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`Alt Account Scan — ${target.steam2}`)
      .setURL(`https://steamcommunity.com/profiles/${target.steam64}`)
      .setDescription(summaryLines.join('\n') || 'No data.')
      .addFields({
        name: 'Steam64',
        value: `\`${target.steam64}\``,
        inline: true
      })
      .addFields({
        name: 'Total entries',
        value: String(totalRecords),
        inline: true
      })
      .addFields({
        name: 'Verdict',
        value:
          notable.length === 0
            ? '✅ No candidates found'
            : `${notable.length} account(s) flagged`,
        inline: true
      })
      .setTimestamp();

    if (sdrRegions.length > 0) {
      embed.addFields({
        name: '⚠️ SDR relay detected',
        value: `Recent connections in **${sdrRegions.join(', ')}** route through Valve SDR — real IP is hidden. Alt detection is less effective for recent activity.`
      });
    }

    if (errors.length > 0) {
      embed.addFields({ name: '❌ Region errors', value: errors.join('\n') });
    }

    // Candidate fields (max 8 to stay within Discord limits)
    const candidatesToShow = notable.slice(0, 8);
    for (const c of candidatesToShow) {
      const field = candidateField(c);
      embed.addFields(field);
    }

    if (notable.length > 8) {
      embed.addFields({
        name: `…and ${notable.length - 8} more`,
        value: notable
          .slice(8)
          .map(
            (c) => `${verdictEmoji(c.verdict)} \`${c.steamId}\` — ${c.score}%`
          )
          .join('\n')
          .slice(0, 1024)
      });
    }

    embed.setFooter({
      text: 'Score = IP exclusivity × coverage + temporal proximity bonus + co-presence bonus  |  85%+ = Likely alt · 50%+ = Possible · 20%+ = Weak'
    });

    log.info(
      {
        steamId: target.steam2,
        notable: notable.length,
        requestedBy: interaction.user.id
      },
      'altcheck completed'
    );

    await interaction.editReply({ embeds: [embed] });
  }
};
