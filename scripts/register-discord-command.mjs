// Registers the /remind slash command with Discord.
// Run once (and again whenever you change the command shape):
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node scripts/register-discord-command.mjs
//
// Optional: DISCORD_GUILD_ID=...   (registers per-guild — propagates instantly,
// useful while iterating. Without it, the command is global and may take up to
// an hour to appear.)

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !BOT_TOKEN) {
  console.error("Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN.");
  process.exit(1);
}

const command = {
  name: "remind",
  description: "Create a reminder. Omit the time to repeat every 2 hours.",
  options: [
    {
      name: "text",
      description: "What to remind you about",
      type: 3, // STRING
      required: true,
    },
    {
      name: "when",
      description:
        "When (e.g. 'tomorrow 9am', 'in 30 minutes'). Leave blank to repeat every 2h.",
      type: 3, // STRING
      required: false,
    },
  ],
};

const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(command),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Failed (${res.status}):`, text);
  process.exit(1);
}
console.log(`Registered ${GUILD_ID ? "guild" : "global"} command:`, text);
