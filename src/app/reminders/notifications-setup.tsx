"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "idle" | "unsupported" | "subscribed" | "blocked";

export function NotificationsSetup({
  initialDiscord,
}: {
  initialDiscord: string | null;
}) {
  const [pushState, setPushState] = useState<PushState>("idle");
  const [discord, setDiscord] = useState(initialDiscord ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("blocked");
      return;
    }
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) setPushState("subscribed");
    });
  }, []);

  async function enablePush() {
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushState("blocked");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });
      const json = sub.toJSON();
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: u.user.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      setPushState("subscribed");
      setMsg({ kind: "ok", text: "Notifications enabled" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function saveDiscord() {
    setSaving(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const channels = ["web_push", ...(discord ? ["discord"] : [])];
      const { error } = await supabase.from("user_settings").upsert({
        user_id: u.user.id,
        discord_webhook_url: discord || null,
        default_channels: channels,
      });
      if (error) throw error;
      setMsg({ kind: "ok", text: "Saved" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  }

  const allReady = pushState === "subscribed";
  const summary = summaryForState(pushState, discord);

  return (
    <details className="group rounded-xl border border-border bg-background-elevated overflow-hidden">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
              allReady
                ? "bg-success-soft text-success"
                : "bg-background border border-border text-muted"
            }`}
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10 21a2 2 0 0 0 4 0" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">
              Notification settings
            </p>
            <p className="text-xs text-muted truncate">{summary}</p>
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-muted transition-transform group-open:rotate-180 shrink-0"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="border-t border-border px-4 py-4 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Browser push</p>
            <PushBadge state={pushState} />
          </div>
          {pushState === "unsupported" && (
            <p className="text-xs text-muted">
              This browser doesn&apos;t support push.
            </p>
          )}
          {pushState === "blocked" && (
            <p className="text-xs text-danger">
              Notifications blocked. Enable in browser settings.
            </p>
          )}
          {pushState === "subscribed" && (
            <p className="text-xs text-muted">
              You&apos;ll get a push on this device when reminders fire.
            </p>
          )}
          {pushState === "idle" && (
            <button
              onClick={enablePush}
              className="rounded-lg bg-brand text-brand-foreground px-3 py-2 text-sm font-medium shadow-sm shadow-brand/30 transition-all hover:brightness-110 active:brightness-95"
            >
              Enable push notifications
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="discord-webhook" className="text-sm font-medium">
              Discord webhook
            </label>
            <span className="text-xs text-muted">Optional backup</span>
          </div>
          <div className="flex gap-2">
            <input
              id="discord-webhook"
              type="url"
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="flex-1 rounded-lg border border-border bg-background-elevated px-3 py-2 text-sm transition-colors placeholder:text-muted/70"
            />
            <button
              onClick={saveDiscord}
              disabled={saving}
              className="rounded-lg bg-foreground text-background px-3 py-2 text-sm font-medium transition-all hover:opacity-90 active:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {msg && (
          <p
            role={msg.kind === "err" ? "alert" : "status"}
            className={`text-xs rounded-md px-3 py-2 ${
              msg.kind === "err"
                ? "bg-danger-soft text-danger"
                : "bg-success-soft text-success"
            }`}
          >
            {msg.text}
          </p>
        )}
      </div>
    </details>
  );
}

function PushBadge({ state }: { state: PushState }) {
  if (state === "subscribed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft text-success px-2 py-0.5 text-xs font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-success" /> On
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft text-danger px-2 py-0.5 text-xs font-medium">
        Blocked
      </span>
    );
  }
  if (state === "unsupported") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-background border border-border text-muted px-2 py-0.5 text-xs font-medium">
        Unsupported
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-background border border-border text-muted px-2 py-0.5 text-xs font-medium">
      Off
    </span>
  );
}

function summaryForState(state: PushState, discord: string): string {
  const parts: string[] = [];
  if (state === "subscribed") parts.push("Push on");
  else if (state === "blocked") parts.push("Push blocked");
  else if (state === "unsupported") parts.push("Push unsupported");
  else parts.push("Push off");
  if (discord) parts.push("Discord ✓");
  return parts.join(" · ");
}
