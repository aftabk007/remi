import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateReminderForm } from "./create-form";
import { ReminderActions } from "./reminder-actions";
import { NotificationsSetup } from "./notifications-setup";
import {
  formatAbsolute,
  formatRelative,
  isOverdue,
} from "@/lib/format-time";

export const dynamic = "force-dynamic";

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  category: string;
  rrule: string | null;
  due_at: string | null;
  next_fire_at: string | null;
  status: string;
  created_at: string;
};

const CATEGORY_STYLES: Record<string, string> = {
  work: "bg-brand-soft text-brand-soft-foreground",
  home: "bg-warning-soft text-warning",
  personal: "bg-success-soft text-success",
};

export default async function RemindersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: rawReminders } = await supabase
    .from("reminders")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: settings } = await supabase
    .from("user_settings")
    .select("discord_webhook_url")
    .maybeSingle();

  const reminders = (rawReminders ?? []) as Reminder[];
  const overdue: Reminder[] = [];
  const upcoming: Reminder[] = [];
  const done: Reminder[] = [];

  for (const r of reminders) {
    if (r.status === "done") {
      done.push(r);
    } else if (
      (r.next_fire_at && isOverdue(r.next_fire_at)) ||
      (!r.next_fire_at && r.due_at && isOverdue(r.due_at))
    ) {
      overdue.push(r);
    } else {
      upcoming.push(r);
    }
  }

  upcoming.sort((a, b) => {
    const at = a.next_fire_at ?? a.due_at ?? a.created_at;
    const bt = b.next_fire_at ?? b.due_at ?? b.created_at;
    return new Date(at).getTime() - new Date(bt).getTime();
  });

  const initial = (user.email ?? "?").charAt(0).toUpperCase();
  const totalActive = overdue.length + upcoming.length;

  return (
    <main className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-brand text-brand-foreground grid place-items-center text-sm font-semibold shadow-sm shadow-brand/20 shrink-0">
              R
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate">
                Reminders
              </h1>
              <p className="text-xs text-muted truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="hidden sm:inline-flex h-7 items-center rounded-full bg-background-elevated border border-border px-2.5 text-xs text-muted"
              aria-label={`${totalActive} active reminders`}
            >
              {totalActive} active
            </span>
            <span
              aria-hidden
              className="h-8 w-8 rounded-full bg-background-elevated border border-border grid place-items-center text-sm font-medium"
              title={user.email ?? ""}
            >
              {initial}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-xs text-muted hover:text-foreground rounded-md px-2 py-1 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        <NotificationsSetup
          initialDiscord={settings?.discord_webhook_url ?? null}
        />

        <CreateReminderForm />

        {!reminders.length && <EmptyState />}

        <ReminderGroup title="Overdue" tone="danger" reminders={overdue} />
        <ReminderGroup
          title="Upcoming"
          tone="default"
          reminders={upcoming}
          emptyMessage={
            reminders.length && !overdue.length && !upcoming.length
              ? "All caught up."
              : undefined
          }
        />
        <ReminderGroup title="Completed" tone="muted" reminders={done} />
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background-elevated/50 p-10 text-center space-y-2">
      <div className="mx-auto h-12 w-12 rounded-full bg-brand-soft text-brand-soft-foreground grid place-items-center text-2xl">
        ⏰
      </div>
      <p className="font-medium">No reminders yet</p>
      <p className="text-sm text-muted">
        Add your first reminder above — try natural language with AI.
      </p>
    </div>
  );
}

function ReminderGroup({
  title,
  reminders,
  tone,
  emptyMessage,
}: {
  title: string;
  reminders: Reminder[];
  tone: "default" | "danger" | "muted";
  emptyMessage?: string;
}) {
  if (!reminders.length && !emptyMessage) return null;

  const titleColor =
    tone === "danger"
      ? "text-danger"
      : tone === "muted"
        ? "text-muted"
        : "text-foreground";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${titleColor}`}
        >
          {title}
        </h2>
        {reminders.length > 0 && (
          <span className="text-xs text-muted">{reminders.length}</span>
        )}
      </div>

      {reminders.length === 0 && emptyMessage && (
        <p className="text-sm text-muted py-2">{emptyMessage}</p>
      )}

      <ul className="space-y-2">
        {reminders.map((r) => (
          <ReminderItem key={r.id} reminder={r} tone={tone} />
        ))}
      </ul>
    </section>
  );
}

function ReminderItem({
  reminder: r,
  tone,
}: {
  reminder: Reminder;
  tone: "default" | "danger" | "muted";
}) {
  const fireAt = r.next_fire_at ?? r.due_at;
  const isDone = tone === "muted";

  const accentLine =
    tone === "danger"
      ? "before:bg-danger"
      : tone === "muted"
        ? "before:bg-border-strong"
        : "before:bg-brand";

  const categoryClass =
    CATEGORY_STYLES[r.category] ??
    "bg-background-elevated text-muted border border-border";

  return (
    <li
      className={`group relative rounded-xl border border-border bg-background-elevated p-4 pl-5 transition-shadow hover:shadow-sm before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-full ${accentLine} ${
        isDone ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
          <div
            className={`font-medium leading-snug break-words ${
              isDone ? "line-through text-muted" : ""
            }`}
          >
            {r.title}
          </div>
          {r.notes && (
            <p className="text-sm text-muted break-words">{r.notes}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium capitalize ${categoryClass}`}
            >
              {r.category}
            </span>
            {r.rrule && (
              <span
                title={r.rrule}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-brand-soft text-brand-soft-foreground font-medium"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                  aria-hidden
                >
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
                Repeats
              </span>
            )}
            {fireAt && (
              <span className="text-muted" title={formatAbsolute(fireAt)}>
                {tone === "danger"
                  ? `was due ${formatRelative(fireAt)}`
                  : tone === "muted"
                    ? formatAbsolute(fireAt)
                    : formatRelative(fireAt)}
              </span>
            )}
          </div>
        </div>
        <ReminderActions id={r.id} status={r.status} />
      </div>
    </li>
  );
}
