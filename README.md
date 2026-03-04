# mge.tf Discord Verification Bot

[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)

Automates Discord account verification for the mge.tf community. Users run `/verify` and the bot checks whether their Discord account is linked to an mge.tf profile, then assigns the Verified role automatically — no admin review needed.

## How it Works

1. A user links their Discord account on mge.tf (Profile → Link Discord Account).
2. They run `/verify` (optionally providing their mge.tf profile URL for cross-check).
3. The bot calls the mge.tf API to confirm the link, then assigns the Verified role.

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Discord application credentials
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_APPLICATION_ID=your_application_id_here

# Optional: guild-scoped command deployment (faster — use during development)
DISCORD_GUILD_ID=your_guild_id_here

# mge.tf API — generate a key in the admin panel under Site > API Keys
MGE_API_URL=https://mge.tf
MGE_API_KEY=mge_your_api_key_here

# Discord role ID to assign to verified users
VERIFIED_ROLE_ID=your_verified_role_id_here

# Optional: restrict /verify to a specific channel
VERIFICATION_CHANNEL_ID=
```

### 3. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and add a Bot user
3. Under **Privileged Gateway Intents**, enable **Server Members Intent** (required for role assignment)
4. Copy the bot token to `DISCORD_BOT_TOKEN`

### 4. Generate an API Key

1. Log in to mge.tf as a head admin
2. Go to **Admin → Site → API Keys**
3. Create a new key (e.g. "Discord Verification Bot")
4. Copy the key to `MGE_API_KEY`

### 5. Deploy commands

```bash
# Guild deploy — instant, use during development (requires DISCORD_GUILD_ID)
bun run deploy-commands

# Global deploy — takes up to 1 hour to propagate, use for production
bun run deploy-commands --global
```

### 6. Run the bot

```bash
bun run start
```

## Commands

| Command | Description |
|---------|-------------|
| `/verify` | Verify your mge.tf account and receive the Verified role |
| `/verify profile:<url>` | Same as above, but cross-checks the provided mge.tf profile URL |

## Project Structure

```
src/
├── index.ts          # Entry point
├── client.ts         # Discord client + intents
├── env.ts            # Environment variable validation (Zod)
├── types.d.ts        # Type definitions
├── deploy.ts         # Slash command deployment script
├── commands/
│   └── verify.ts     # /verify command
├── events/
│   ├── ready.ts      # Bot ready handler
│   └── interaction-create.ts  # Command router
└── utils/
    ├── api.ts        # mge.tf API client
    ├── core.ts       # Dynamic command/event loader
    ├── logger.ts     # Pino logger
    └── error-handler.ts  # Global error handlers
```

## Deployment

### Railway

1. Create a project on [Railway](https://railway.app/) and connect this repository
2. Set all environment variables in the Railway dashboard
3. Railway will build and deploy automatically via the included `Dockerfile`

Or deploy via CLI:

```bash
railway up
```

### Docker

```bash
docker build -t mgetf-discord-bot .
docker run -d --env-file .env mgetf-discord-bot
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run start` | Start the bot |
| `bun run deploy-commands` | Deploy slash commands to guild |
| `bun run deploy-commands --global` | Deploy slash commands globally |
| `bun run lint` | Run Biome linter |
| `bun run fmt` | Format code with Biome |
| `bun run check` | Lint + format |
| `bun run typecheck` | TypeScript type check |
