# REXO Bedrock AFK BOT

A Node.js Minecraft Bedrock Edition client designed for an Aternos server and Render Web Service.

## Important

This is a **Bedrock protocol client**, not Mineflayer. The current Mineflayer project is Java-oriented. `bedrock-protocol` provides the Bedrock client API and supports automatic server-version negotiation when `version` is omitted.

## Files

- `index.js` — Bedrock client + reconnect + web dashboard
- `settings.json` — server/bot configuration
- `package.json` — Render/npm configuration

## Configure

Edit `settings.json`:

- `bot.username` — bot name
- `bot.offline` — keep `true` only if your Bedrock server accepts offline authentication
- `server.host` — Aternos Bedrock address
- `server.port` — **use the Bedrock UDP port shown by Aternos**
- `server.version` — leave empty for automatic version negotiation, or set a supported version

If the Aternos server requires Microsoft/Xbox authentication, set `offline` to `false`. The program will print a Microsoft device-login URL/code in the Render logs.

## Render

Build Command:
`npm install`

Start Command:
`npm start`

The app listens on Render's `PORT` and provides:

- `/` — dashboard
- `/health` — JSON health information
- `/ping` — health ping

## Limitations

`bedrock-protocol` is a low-level Bedrock protocol client. It does not provide Mineflayer's Java-style pathfinder/inventory/entity API. This version focuses on reliable connection, reconnect, status monitoring, and configurable chat activity.

A hosting provider can restart or suspend a free service; the self-ping is not a guarantee of uninterrupted 24/7 hosting.

## Disclaimer

Not affiliated with Aternos, Mojang, or Microsoft. Check the rules of the server and hosting provider before using an automated client.
