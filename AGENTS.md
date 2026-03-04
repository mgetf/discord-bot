## Overview

The **mge.tf Discord Verification Bot** automates account verification for the mge.tf community.
When a user runs `/verify`, the bot calls the mge.tf external API to check whether their Discord ID is linked to an mge.tf account, then assigns the Verified role on success.

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
├── client.ts         # Discord Client setup (Guilds + GuildMembers intents)
├── env.ts            # Environment variable schema
├── types.d.ts        # Type definitions
├── deploy.ts         # Command deployment script
├── commands/
│   └── verify.ts     # /verify slash command
├── events/
│   ├── ready.ts      # Bot ready handler
│   └── interaction-create.ts  # Command router
└── utils/
    ├── api.ts        # mge.tf external API client
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
**Discord Client singleton**. Enables `Guilds` and `GuildMembers` intents.
`GuildMembers` is a Privileged Intent — it must be enabled in the Discord Developer Portal.

### `src/env.ts`
**Environment variable validation**. Type-safe with Zod schema.
```typescript
// Required
DISCORD_BOT_TOKEN: string
DISCORD_APPLICATION_ID: string
MGE_API_URL: string      // e.g. https://mge.tf
MGE_API_KEY: string      // Generated in Admin → Site → API Keys
VERIFIED_ROLE_ID: string // Discord role ID to assign on verification

// Optional
DISCORD_GUILD_ID?: string           // Guild-scoped command deployment
VERIFICATION_CHANNEL_ID?: string    // Restrict /verify to one channel
LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
```

### `src/utils/api.ts`
**mge.tf API client**. Exports `mgeApi` with:
- `getDiscordLink(discordId)` — calls `GET /api/v1/discord/:discordId`, returns linked account or null

### `src/commands/verify.ts`
**`/verify` command**. Full flow:
1. Optionally restricts to `VERIFICATION_CHANNEL_ID`
2. Calls `mgeApi.getDiscordLink(interaction.user.id)`
3. If a `profile` URL argument was provided, cross-checks the Steam ID
4. Assigns `VERIFIED_ROLE_ID` via `interaction.member.roles.add()`
5. All replies are ephemeral

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
- `ready.ts`: Bot ready. Generates invite link (dev only)
- `interaction-create.ts`: Handles slash command interactions

---

## `src/utils/` - Utilities

### `api.ts`
**mge.tf API client**. Configure base URL and key via env. Throws on network errors, returns null on 404.

### `core.ts`
**Dynamic module loader**.
- `getCommands()`: Loads `.ts` files from `src/commands/`
- `getEvents()`: Loads `.ts` files from `src/events/`
- Also includes `index.ts` in subdirectories

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

### Pre-commit Hook
`lefthook` runs `bun run check` automatically before commit.

---

## Deployment

### Railway
- `railway.json` pre-configured
- Set all env vars in the Railway dashboard: `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `MGE_API_URL`, `MGE_API_KEY`, `VERIFIED_ROLE_ID`

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
