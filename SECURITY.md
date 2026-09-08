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
- The bot's OAuth2 invite requests the minimum permissions needed (`Manage Roles`, `View Audit Log`, `Send Messages`, `Embed Links`) — it does not request `Administrator`.
- Discord roles mapped in the mge.tf staff hub are not assignable by hand. The bot reverts those additions (it does not revert removals) and DMs the executor in English to use `/admin/staff`. If the audit log or DM fails, it still reverts and logs. Staff assignments from the website use the bot token, so those additions are skipped.
