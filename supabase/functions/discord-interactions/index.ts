// Supabase Edge Function: discord-interactions
// HTTP endpoint for Discord's Interactions API. Handles the `/remind` slash
// command — creates a reminder for the channel owner. If no `when` is given,
// the reminder repeats every 2 hours via RRULE.

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as chrono from "https://esm.sh/chrono-node@2.7.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DISCORD_PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;
// Supabase auth user ID that owns reminders created from Discord (single-user app).
const OWNER_USER_ID = Deno.env.get("DISCORD_OWNER_SUPABASE_USER_ID")!;
// Optional: only accept commands from this Discord user ID.
const ALLOWED_DISCORD_USER_ID = Deno.env.get("DISCORD_OWNER_DISCORD_USER_ID")
  ?.trim();

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2 } as const;
const ResponseType = { PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4 } as const;
const EPHEMERAL_FLAG = 1 << 6;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

let publicKeyPromise: Promise<CryptoKey> | null = null;
function getPublicKey(): Promise<CryptoKey> {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey(
      "raw",
      hexToBytes(DISCORD_PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  }
  return publicKeyPromise;
}

async function verify(
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await getPublicKey();
    const message = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signatureHex),
      message,
    );
  } catch (e) {
    console.error("signature verify failed", e);
    return false;
  }
}

function reply(content: string, ephemeral = false) {
  return new Response(
    JSON.stringify({
      type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
        ...(ephemeral ? { flags: EPHEMERAL_FLAG } : {}),
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

interface SlashOption {
  name: string;
  type: number;
  value: string;
}

function getOption(
  options: SlashOption[] | undefined,
  name: string,
): string | undefined {
  return options?.find((o) => o.name === name)?.value?.toString().trim();
}

async function getOwnerTimezone(): Promise<string> {
  const { data } = await supabase
    .from("user_settings")
    .select("timezone")
    .eq("user_id", OWNER_USER_ID)
    .maybeSingle();
  return data?.timezone ?? "Asia/Karachi";
}

// Compute the UTC offset (in minutes) of a given IANA timezone at a given instant.
function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).filter((p) => p.type !== "literal").map((
      p,
    ) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUTC = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour === 24 ? 0 : +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return Math.round((asUTC - at.getTime()) / 60000);
}

// Parse `when` as natural language. Relative phrases ("in 2 minutes") yield
// an absolute UTC instant from chrono directly. Absolute clock phrases
// ("9am", "14:00") are returned as runtime-local (UTC on Deno Deploy) and
// must be reinterpreted in the owner's timezone.
function parseWhen(input: string, tz: string): Date | null {
  const now = new Date();
  const result = chrono.parse(input, now, { forwardDate: true })[0];
  if (!result) return null;
  const naive = result.start.date();
  const userGaveClockTime = result.start.isCertain("hour");
  const userGaveTzOffset = result.start.isCertain("timezoneOffset");
  if (!userGaveClockTime || userGaveTzOffset) {
    return naive;
  }
  const offsetMin = tzOffsetMinutes(tz, naive);
  return new Date(naive.getTime() - offsetMin * 60_000);
}

async function handleRemind(options: SlashOption[]): Promise<Response> {
  const text = getOption(options, "text");
  const when = getOption(options, "when");
  if (!text) return reply("Need a `text` for the reminder.", true);

  const tz = await getOwnerTimezone();
  const now = new Date();

  let dueAt: Date;
  let rrule: string | null;
  let confirmation: string;

  if (!when) {
    dueAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    rrule = "FREQ=HOURLY;INTERVAL=2";
    confirmation = `🔁 Reminder saved — repeating every 2 hours.\n> ${text}`;
  } else {
    const parsed = parseWhen(when, tz);
    if (!parsed || parsed.getTime() <= now.getTime()) {
      return reply(
        `Couldn't parse \`${when}\` as a future time. Try \`tomorrow 9am\`, \`in 30 minutes\`, or \`2026-05-10 14:00\`.`,
        true,
      );
    }
    dueAt = parsed;
    rrule = null;
    confirmation = `⏰ Reminder saved for <t:${
      Math.floor(dueAt.getTime() / 1000)
    }:F>.\n> ${text}`;
  }

  const { error } = await supabase.from("reminders").insert({
    user_id: OWNER_USER_ID,
    title: text,
    due_at: dueAt.toISOString(),
    rrule,
    next_fire_at: dueAt.toISOString(),
    channels: ["discord", "web_push"],
  });

  if (error) {
    console.error("insert reminder failed", error);
    return reply(`Failed to save reminder: ${error.message}`, true);
  }

  return reply(confirmation);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const body = await req.text();

  if (
    !signature || !timestamp ||
    !(await verify(signature, timestamp, body))
  ) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body) as {
    type: number;
    data?: { name?: string; options?: SlashOption[] };
    member?: { user?: { id?: string } };
    user?: { id?: string };
  };

  if (interaction.type === InteractionType.PING) {
    return new Response(JSON.stringify({ type: ResponseType.PONG }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return new Response("unsupported interaction", { status: 400 });
  }

  if (ALLOWED_DISCORD_USER_ID) {
    const callerId = interaction.member?.user?.id ?? interaction.user?.id;
    if (callerId !== ALLOWED_DISCORD_USER_ID) {
      return reply("Not authorized to use this command.", true);
    }
  }

  const name = interaction.data?.name;
  if (name === "remind") {
    return await handleRemind(interaction.data?.options ?? []);
  }

  return reply(`Unknown command: ${name}`, true);
});
