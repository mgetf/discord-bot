## Overview

The **mge.tf Discord Bot** serves the mge.tf community with three features:

- **Verification** — linking Discord on mge.tf grants **MGER** and removes **Unverified**. Unlinking reverses that. The bot DMs the user when roles change. `/verify` remains a fallback. The bot also verifies on guild join when the Discord ID is already linked.
- **Alt detection** — `/altcheck` cross-references shared-IP whois databases (per region) to flag likely alt accounts of a given Steam ID.
- **Staff role protection** — hub-managed Discord roles follow mge.tf. `GET /api/v1/staff/discord-managed-roles` is the catalog; `GET /api/v1/staff/discord-desired-roles/:discordId` is who should hold them. Manual add or remove in Discord is reconciled back to that assignment. Verification DMs are best-effort; Discord 50007 is ignored when the user has DMs from server members closed.
- **AI ops chat** — allowlisted users @mention the bot (or reply to it) and an Anthropic tool loop inspects/fixes channel permission overwrites. Conversation state is in-memory per `channelId:userId` for 30 minutes.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Bun | Runtime & package manager |
| TypeScript | Type safety |
| discord.js v14 | Discord API wrapper |
| Zod + @t3-oss/env-core | Environment variable validation |
| Biome | Linter & formatter |
| Pino | Logging |

---

## Directory Structure

```
src/
├── index.ts          # Entry point
├── client.ts         # Discord Client setup (Guilds + GuildMembers + GuildMessages + MessageContent)
├── env.ts            # Environment variable schema
├── types.d.ts        # Type definitions
├── deploy.ts         # Command deployment script
├── commands/
│   ├── verify.ts     # /verify slash command
│   ├── altcheck.ts   # /altcheck slash command
│   └── agent.ts      # /agent model|prompt|show|reset
├── events/
│   ├── ready.ts      # Bot ready handler
│   ├── guild-member-add.ts     # Auto-verify members whose Discord is linked on mge.tf
│   ├── guild-member-update.ts  # Reconciles hub Discord roles to mge.tf; verifies after membership screening
│   ├── interaction-create.ts  # Command router
│   └── message-create.ts      # AI ops chat (@mention / reply)
├── agent/
│   ├── allowlist.ts      # Who may talk to the AI agent
│   ├── sessions.ts       # In-memory conversation sessions
│   ├── trigger.ts        # Mention / reply gate
│   ├── permissions.ts    # Allowlisted overwrite flags
│   ├── discord-tools.ts  # Channel inspect / overwrite tools
│   ├── split-message.ts  # Discord 2000-char chunking
│   ├── context.ts        # User-turn context block (guild/channel/reply)
│   ├── mentions.ts       # Strip pings from public replies
│   ├── settings.ts       # Runtime model + system prompt (slash-configurable)
│   ├── images.ts         # Download Discord attachments for vision
│   └── run.ts            # Anthropic tool loop
└── utils/
    ├── api.ts        # mge.tf external API client
    ├── managed-staff-roles.ts  # 60s catalog cache of hub-managed role IDs
    ├── staff-role-diff.ts      # managedRoleReconcile() / roleIdSetsEqual()
    ├── verification.ts  # MGER / Unverified role diff, apply, join/link helper
    ├── whois.ts      # Alt-check scoring against whois databases
    ├── core.ts       # Dynamic command/event loader
    ├── logger.ts     # Pino logger configuration
    └── error-handler.ts  # Global error handlers
```

---

## File Responsibilities

### `src/index.ts`
**Entry point**. On startup:
1. Sets up global error handlers
2. Dynamically loads commands → stores in `client.commands` Collection
3. Dynamically loads events → registers with `client.on/once`
4. Logs into Discord

### `src/client.ts`
**Discord Client singleton**. Enables `Guilds` and `GuildMembers` intents, plus `Partials.GuildMember` and `Partials.User`.
`GuildMembers` is a Privileged Intent — it must be enabled in the Discord Developer Portal. Without the GuildMember partial, discord.js does not emit `GuildMemberUpdate` for members that were not already in cache (first role change is dropped).

### `src/env.ts`
**Environment variable validation**. Type-safe with Zod schema.
```typescript
// Required
DISCORD_BOT_TOKEN: string
DISCORD_APPLICATION_ID: string
MGE_API_URL: string      // e.g. https://mge.tf
MGE_API_KEY: string              // Generated in Admin → Site → API Keys
VERIFY_ADD_ROLE_IDS: string      // Comma-separated role IDs to add on verification

// Optional
VERIFY_REMOVE_ROLE_IDS?: string  // Comma-separated role IDs to remove on verification
DISCORD_GUILD_ID?: string        // Guild-scoped command deployment
VERIFICATION_CHANNEL_ID?: string       // Restrict /verify to one channel
VERIFICATION_LOG_CHANNEL_ID?: string   // Channel for verification audit logs
WHOIS_DB_NA?: string              // host:port:password — NA whois DB for /altcheck
WHOIS_DB_EU?: string              // host:port:password — EU whois DB for /altcheck
WHOIS_DB_ASIA?: string            // host:port:password — Asia whois DB for /altcheck
ALTCHECK_CHANNEL_ID?: string      // Restrict /altcheck to one channel
AGENT_ALLOWED_USER_IDS?: string   // Comma-separated user snowflakes. Empty = application owner only
ANTHROPIC_API_KEY?: string        // Required to enable the AI agent
AGENT_MODEL?: string              // Default claude-sonnet-5-5; /agent model overrides at runtime
LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
```

### `src/utils/api.ts`
**mge.tf API client**. Exports `mgeApi` with:
- `getDiscordLink(discordId)` — calls `GET /api/v1/discord/:discordId`, returns linked account or null
- `getUserBySteamId(steamId)` — calls `GET /api/v1/users/:steamId`
- `getManagedStaffRoleIds()` — calls `GET /api/v1/staff/discord-managed-roles`, returns `{ roleIds }`

### `src/commands/verify.ts`
**`/verify` command**. Fallback if auto-verify missed the member.
1. Optionally restricts to `VERIFICATION_CHANNEL_ID`
2. Calls `mgeApi.getDiscordLink(interaction.user.id)`
3. If a `profile` URL argument was provided, cross-checks the Steam ID
4. Assigns `VERIFY_ADD_ROLE_IDS` (MGER) and removes `VERIFY_REMOVE_ROLE_IDS` (Unverified)
5. All replies are ephemeral

### `src/commands/altcheck.ts`
**`/altcheck` command**. Full flow:
1. Optionally restricts to `ALTCHECK_CHANNEL_ID`
2. Normalizes the provided Steam ID (accepts `STEAM_0:Y:W`, `[U:1:N]`, or Steam64)
3. Builds the list of configured regions from `WHOIS_DB_NA/EU/ASIA` and runs `runAltCheck()` from `src/utils/whois.ts` against each
4. Renders a summary embed with per-region entry counts, IP overlap, and scored alt candidates (weighted by IP exclusivity, temporal proximity, and co-presence)
5. No permission gating beyond the optional channel restriction — anyone able to use slash commands in that channel can run it

### `src/commands/agent.ts`
**`/agent` command**. Allowlisted operators only (same list as the AI chat). Subcommands:
- `model` — dropdown of Haiku / Sonnet / Opus 4.5 and 5.5
- `prompt` — opens a modal (4000 chars) to replace the system prompt
- `show` — ephemeral dump of the live model + prompt
- `reset` — wipe file overrides (model falls back to `AGENT_MODEL`)

Persisted to `data/agent-settings.json`. Redeploy wipes that file unless a volume is mounted.

---

## `src/commands/` - Adding Commands

### File Structure
- **Single file**: `src/commands/hello.ts` → filename does not need to match command name
- **Barrel file**: `src/commands/admin/index.ts` → useful for grouped commands

### Template

```typescript
import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from '@/types';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('commandname')
    .setDescription('Command description'),
  execute: async (interaction) => {
    await interaction.reply('Response');
  }
};
```

### Best Practices
- **Always export as `command`**
- Use `MessageFlags.Ephemeral` for private responses
- Call `interaction.deferReply()` for any async work (API calls, DB queries)
- Use `EmbedBuilder` for rich responses
- Create a child logger: `logger.child({ name: 'commands/xxx' })`

---

## `src/events/` - Adding Events

### Template

```typescript
import { Events } from 'discord.js';
import type { Event } from '@/types';

export const event: Event<Events.EventName> = {
  name: Events.EventName,
  runOnce: false,
  execute: async (...args) => {
    // Event handling
  }
};
```

### Existing Events
- `ready.ts`: Bot ready. Generates an invite link with the minimum permissions the bot needs (`ManageRoles`, `ManageChannels`, `ViewAuditLog`, `SendMessages`, `EmbedLinks`, `ReadMessageHistory`, `AddReactions`), logged in dev only. Prefetches managed staff role IDs and the Discord application owner for the AI allowlist.
- `guild-member-add.ts`: If the joining member's Discord ID is linked on mge.tf, grant MGER, remove Unverified, and DM them.
- `guild-member-update.ts`: On role changes, load desired hub roles from mge.tf and add/remove until Discord matches. Nickname-only updates are skipped when `oldMember` is cached. Uncached members still reconcile (partials). After membership screening (`pending` → not pending), runs the same auto-verify as join. If `DISCORD_GUILD_ID` is set, only that guild is watched.
- `interaction-create.ts`: Handles slash commands and the `/agent prompt` modal
- `message-create.ts`: AI ops chat. Allowlisted users who @mention the bot or reply to it get a public reply in the same channel. Follow-up replies continue the same in-memory session.

---

## `src/utils/` - Utilities

### `api.ts`
**mge.tf API client**. Configure base URL and key via env. User lookups return null on 404. Staff catalog / desired-role routes throw on HTTP errors (a 404 means the website endpoint is not deployed).

### `managed-staff-roles.ts`
**Staff hub Discord roles**. `managedRoleReconcile(current, desired, managed)` in `staff-role-diff.ts` is the add/remove diff. `getCachedManagedStaffRoleIds()` refreshes from `mgeApi.getManagedStaffRoleIds()` about every 60s and on `ready`; failed fetches are cached for the same TTL so a missing website route is not hammered on every member update.

### `whois.ts`
**Alt-check scoring**. Connects to per-region MySQL whois databases (credentials from `WHOIS_DB_NA/EU/ASIA`, format `host:port:password`), looks up connection history for a Steam ID, and scores other accounts sharing IPs as potential alts (IP exclusivity + coverage, temporal proximity, co-presence bonuses). Detects Valve SDR relay addresses and weights those matches lower.

### `core.ts`
**Dynamic module loader**.
- `getCommands()`: Loads `.ts` files from `src/commands/`
- `getEvents()`: Loads `.ts` files from `src/events/`
- Also includes `index.ts` in subdirectories
- Skips `*.test.ts` / `*.spec.ts`

### `src/agent/`
**AI ops chat**. `message-create.ts` is the Discord listener. `run.ts` is the Anthropic tool loop. `context.ts` builds the user-turn context block, including `replied_message_content` when the user replied to a message (`fetchReference()`). `images.ts` downloads jpeg/png/gif/webp attachments (current message + replied message, max 4, 5 MB each) and sends them as vision blocks. `settings.ts` holds the live model + system prompt (`/agent`); persisted to `data/agent-settings.json`. `mentions.ts` breaks `@everyone` / role / user pings in public replies. Sessions are in-memory (`channelId:userId`, 30 minute TTL). Tools live in `discord-tools.ts` and can only edit a fixed set of channel permission flags.

### `logger.ts`
**Pino logger configuration**.
```typescript
import { logger } from '@/utils/logger';
const log = logger.child({ name: 'module-name' });
log.info('message');
log.error({ err: error }, 'error message');
```

### `error-handler.ts`
**Global error handling**.
- `unhandledRejection`: Unhandled Promise errors
- `uncaughtException`: Uncaught exceptions (exits process)
- `SIGINT/SIGTERM`: Graceful shutdown

---

## Path Aliases

`@/` → maps to `src/` (configured in `tsconfig.json`)

```typescript
import { env } from '@/env';
import type { Command } from '@/types';
import { mgeApi } from '@/utils/api';
```

---

## Coding Conventions

### Biome Config (`biome.jsonc`)
- Indent: 2 spaces
- Quotes: single quotes
- Trailing commas: none
- `const` preferred

### Type Safety
- `strict: true` enabled
- `noUncheckedIndexedAccess: true`: Must handle undefined for array access

---

## Development Workflow

| Command | Description |
|---------|-------------|
| `bun run start` | Start bot |
| `bun run deploy-commands` | Deploy commands to guild |
| `bun run deploy-commands --global` | Global deploy |
| `bun run check` | Biome lint + format |
| `bun run typecheck` | TypeScript check |
| `bun run test` | Unit tests |

### Pre-commit Hook
`lefthook` runs `bun run check` automatically before commit.

---

## Deployment

### Railway
- `railway.json` pre-configured
- Set all env vars in the Railway dashboard: `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `MGE_API_URL`, `MGE_API_KEY`, `VERIFIED_ROLE_ID`, `ANTHROPIC_API_KEY`

### Docker
```bash
docker build -t mgetf-discord-bot .
docker run -d --env-file .env mgetf-discord-bot
```
Multi-stage build, non-root user.

---

## Adding New Environment Variables
1. Add Zod schema to `src/env.ts`
2. Add to `.env.example`
3. Update this file under `src/env.ts` section
