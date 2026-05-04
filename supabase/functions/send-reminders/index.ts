// Supabase Edge Function: send-reminders
// Triggered by pg_cron every minute. Finds due reminders, sends Web Push + Discord,
// and advances next_fire_at for recurring ones.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { rrulestr } from "npm:rrule@2.8.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@remi.app";

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

function nextOccurrence(r: Reminder): string | null {
  if (!r.rrule || !r.due_at) return null;
  try {
    const block = `DTSTART:${isoToICal(r.due_at)}\nRRULE:${r.rrule}`;
    const rule = rrulestr(block);
    const next = rule.after(new Date(), false); // strictly after now
    return next ? next.toISOString() : null;
  } catch (e) {
    console.error("rrule parse failed", r.id, r.rrule, e);
    return null;
  }
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
      .select("discord_webhook_url")
      .eq("user_id", r.user_id)
      .maybeSingle();

    if (r.channels.includes("web_push") && subs?.length) {
      const err = await sendWebPush(subs, r);
      await logResult(r.id, "web_push", !err, err);
    }

    if (r.channels.includes("discord") && settings?.discord_webhook_url) {
      const err = await sendDiscord(settings.discord_webhook_url, r);
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
