"use client";

import { useTransition } from "react";
import { deleteReminder, setReminderStatus } from "./actions";

export function ReminderActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const isDone = status === "done";

  return (
    <div className="flex gap-1 shrink-0">
      <button
        type="button"
        disabled={pending}
        title={isDone ? "Mark as not done" : "Mark as done"}
        aria-label={isDone ? "Mark as not done" : "Mark as done"}
        onClick={() =>
          start(() => setReminderStatus(id, isDone ? "pending" : "done"))
        }
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
          isDone
            ? "bg-success-soft border-success/30 text-success hover:brightness-95"
            : "bg-background-elevated border-border text-muted hover:text-foreground hover:border-border-strong"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M4 12l5 5L20 6" />
        </svg>
      </button>
      <button
        type="button"
        disabled={pending}
        title="Delete"
        aria-label="Delete reminder"
        onClick={() => {
          if (confirm("Delete this reminder?")) start(() => deleteReminder(id));
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-elevated text-muted hover:text-danger hover:border-danger/30 hover:bg-danger-soft transition-colors disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        </svg>
      </button>
    </div>
  );
}
