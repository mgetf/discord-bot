# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it privately using [GitHub Security Advisories](../../security/advisories/new) rather than opening a public issue.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any relevant logs (with tokens/credentials redacted)

We aim to acknowledge reports within a few days.

## Scope Notes

- `DISCORD_BOT_TOKEN`, `MGE_API_KEY`, and the `WHOIS_DB_*` connection strings are read from environment variables only and are never logged or echoed to Discord.
- `/altcheck` has no role-based permission gating in this version — it can optionally be restricted to a single channel via `ALTCHECK_CHANNEL_ID`, but any user able to run slash commands in that channel can query the whois databases. Treat channel access as the access-control boundary when deploying this bot.
- The bot's OAuth2 invite requests the minimum permissions needed (`Manage Roles`, `Send Messages`, `Embed Links`) — it does not request `Administrator`.
