// Supabase Edge Function: send-reminders
// Triggered by pg_cron every minute. Finds due reminders, sends Web Push + Discord,
// and advances next_fire_at for recurring ones.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { RRule, rrulestr } from "https://esm.sh/rrule@2.8.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@remi.app";
const FALLBACK_DISCORD_WEBHOOK = Deno.env.get("DISCORD_WEBHOOK_URL")?.trim() ??
  "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface Reminder {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  channels: string[];
  due_at: string | null;
  rrule: string | null;
  next_fire_at: string;
}

function isoToICal(iso: string): string {
  // 2026-05-03T16:07:00.000Z → 20260503T160700Z
  return iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
}

// Manual fallback for simple FREQ+INTERVAL rules. Always returns a future date
// — guarantees recurring reminders never get stranded with next_fire_at = null
// if the rrule library trips on something inside Deno.
function manualNextOccurrence(rrule: string, dueAt: Date): Date | null {
  const parts = Object.fromEntries(
    rrule.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k.toUpperCase(), v];
    }),
  );
  const interval = parseInt(parts.INTERVAL ?? "1", 10) || 1;
  const stepMs: Record<string, number> = {
    MINUTELY: 60_000,
    HOURLY: 60 * 60_000,
    DAILY: 24 * 60 * 60_000,
    WEEKLY: 7 * 24 * 60 * 60_000,
  };
  const ms = stepMs[parts.FREQ];
  if (!ms) return null;
  const stepSize = interval * ms;
  const now = Date.now();
  const elapsed = now - dueAt.getTime();
  const stepsAhead = elapsed < 0 ? 0 : Math.floor(elapsed / stepSize) + 1;
  return new Date(dueAt.getTime() + stepsAhead * stepSize);
}

function nextOccurrence(r: Reminder): string | null {
  if (!r.rrule || !r.due_at) return null;
  const dueAt = new Date(r.due_at);
  // Try rrule.js's options-based path first — more robust than the iCal block
  // parser which has tripped inside Deno on identical inputs that work in Node.
  try {
    const opts = RRule.parseString(r.rrule);
    opts.dtstart = dueAt;
    const rule = new RRule(opts);
    const next = rule.after(new Date(), false);
    if (next) return next.toISOString();
  } catch (e) {
    console.error("rrule options-path failed", r.id, r.rrule, e);
  }
  // Last-resort iCal block path (preserves prior behavior for exotic rules).
  try {
    const block = `DTSTART:${isoToICal(r.due_at)}\nRRULE:${r.rrule}`;
    const rule = rrulestr(block);
    const next = rule.after(new Date(), false);
    if (next) return next.toISOString();
  } catch (e) {
    console.error("rrule block-path failed", r.id, r.rrule, e);
  }
  // Manual fallback for simple FREQ+INTERVAL rules.
  const fallback = manualNextOccurrence(r.rrule, dueAt);
  if (fallback) return fallback.toISOString();
  console.error("nextOccurrence exhausted all paths", r.id, r.rrule);
  return null;
}

async function sendDiscord(webhookUrl: string, r: Reminder) {
  const body = {
    content: `🔔 **${r.title}**${r.notes ? `\n${r.notes}` : ""}`,
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? null : `discord ${res.status}`;
}

function uniqueChannels(...channelGroups: (string[] | null | undefined)[]) {
  return [...new Set(channelGroups.flatMap((channels) => channels ?? []))];
}

async function sendWebPush(
  subs: { endpoint: string; p256dh: string; auth: string }[],
  r: Reminder,
) {
  const payload = JSON.stringify({
    title: r.title,
    body: r.notes ?? "",
    reminderId: r.id,
    url: "/reminders",
  });
  const errors: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (e: unknown) {
        const err = e as { statusCode?: number; message?: string };
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", s.endpoint);
        } else {
          errors.push(err.message ?? String(e));
        }
      }
    }),
  );
  return errors.length ? errors.join("; ") : null;
}

async function logResult(
  reminderId: string,
  channel: string,
  success: boolean,
  error: string | null,
) {
  await supabase.from("notification_log").insert({
    reminder_id: reminderId,
    channel,
    success,
    error,
  });
}

Deno.serve(async () => {
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("reminders")
    .select("id,user_id,title,notes,channels,due_at,rrule,next_fire_at")
    .eq("status", "pending")
    .lte("next_fire_at", now)
    .not("next_fire_at", "is", null)
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  let processed = 0;

  for (const r of (due ?? []) as Reminder[]) {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", r.user_id);

    const { data: settings } = await supabase
      .from("user_settings")
      .select("discord_webhook_url,default_channels")
      .eq("user_id", r.user_id)
      .maybeSingle();

    const channels = uniqueChannels(
      r.channels,
      settings?.default_channels,
      FALLBACK_DISCORD_WEBHOOK ? ["discord"] : [],
    );
    const discordWebhook = settings?.discord_webhook_url?.trim() ||
      FALLBACK_DISCORD_WEBHOOK;

    if (channels.includes("web_push") && subs?.length) {
      const err = await sendWebPush(subs, r);
      await logResult(r.id, "web_push", !err, err);
    }

    if (channels.includes("discord") && discordWebhook) {
      const err = await sendDiscord(discordWebhook, r);
      await logResult(r.id, "discord", !err, err);
    }

    // Advance: recurring reminders get the next occurrence; one-shots get null.
    const next = nextOccurrence(r);
    await supabase
      .from("reminders")
      .update({ next_fire_at: next })
      .eq("id", r.id);

    processed++;
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
});
