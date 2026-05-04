"use client";

import { useState, useTransition } from "react";
import {
  createReminder,
  parseWithAI,
  createFromParsed,
} from "./actions";
import type { ParsedReminder } from "@/lib/llm";

type Mode = "closed" | "ai" | "manual";

const inputCls =
  "w-full rounded-lg border border-border bg-background-elevated px-3 py-2.5 text-sm transition-colors placeholder:text-muted/70";

const primaryBtn =
  "rounded-lg bg-brand text-brand-foreground px-3 py-2 text-sm font-medium shadow-sm shadow-brand/30 transition-all hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed";

const ghostBtn =
  "rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground hover:bg-background transition-colors";

export function CreateReminderForm() {
  const [mode, setMode] = useState<Mode>("closed");

  if (mode === "closed") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode("ai")}
          className="group flex flex-col items-start gap-1 rounded-xl border border-border bg-background-elevated p-4 text-left transition-all hover:border-brand/50 hover:bg-brand-soft/40 hover:shadow-sm"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground text-base">
            ✨
          </span>
          <span className="text-sm font-medium">Add with AI</span>
          <span className="text-xs text-muted">Describe it in plain English</span>
        </button>
        <button
          onClick={() => setMode("manual")}
          className="group flex flex-col items-start gap-1 rounded-xl border border-border bg-background-elevated p-4 text-left transition-all hover:border-foreground/30 hover:shadow-sm"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-border text-base">
            +
          </span>
          <span className="text-sm font-medium">Add manually</span>
          <span className="text-xs text-muted">Pick fields yourself</span>
        </button>
      </div>
    );
  }

  return mode === "ai" ? (
    <AIForm onClose={() => setMode("closed")} />
  ) : (
    <ManualForm onClose={() => setMode("closed")} />
  );
}

function AIForm({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [parsed, setParsed] = useState<ParsedReminder | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onParse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const p = await parseWithAI(text);
        setParsed(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function onConfirm() {
    if (!parsed) return;
    setError(null);
    start(async () => {
      try {
        await createFromParsed(parsed);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background-elevated p-4 animate-in">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand-soft-foreground text-sm">
          ✨
        </span>
        <span className="text-sm font-medium">Add with AI</span>
      </div>
      <form onSubmit={onParse} className="space-y-3">
        <textarea
          required
          autoFocus
          rows={2}
          placeholder='e.g. "remind me to submit weekly report every Friday at 5pm"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={inputCls}
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className={primaryBtn}
          >
            {pending && !parsed ? "Parsing…" : "Parse"}
          </button>
        </div>
      </form>

      {parsed && (
        <div className="space-y-3 rounded-lg border border-border bg-background p-4 animate-in">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Preview
          </p>
          <div className="space-y-1.5">
            <ParsedRow label="Title" value={parsed.title} />
            {parsed.notes && <ParsedRow label="Notes" value={parsed.notes} />}
            <ParsedRow label="Category" value={parsed.category} />
            <ParsedRow
              label="Due"
              value={
                parsed.due_at
                  ? new Date(parsed.due_at).toLocaleString()
                  : "—"
              }
            />
            {parsed.rrule && (
              <ParsedRow label="Repeats" value={parsed.rrule} />
            )}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setParsed(null)}
              className={ghostBtn}
            >
              Edit text
            </button>
            <button
              onClick={onConfirm}
              disabled={pending}
              className={primaryBtn}
            >
              {pending ? "Saving…" : "Save reminder"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs text-danger bg-danger-soft rounded-md px-3 py-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function ParsedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted w-20 shrink-0 capitalize">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

function ManualForm({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function action(fd: FormData) {
    // Convert datetime-local (local time, no tz) to UTC ISO before sending to server
    const due = fd.get("due_at") as string;
    if (due) fd.set("due_at", new Date(due).toISOString());
    setError(null);
    start(async () => {
      try {
        await createReminder(fd);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-border bg-background-elevated p-4 animate-in"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background border border-border text-sm">
          +
        </span>
        <span className="text-sm font-medium">New reminder</span>
      </div>
      <input
        name="title"
        required
        autoFocus
        placeholder="Submit weekly report"
        className={inputCls}
      />
      <textarea
        name="notes"
        placeholder="Notes (optional)"
        rows={2}
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted">Category</span>
          <select
            name="category"
            defaultValue="work"
            className={`${inputCls} pr-8`}
          >
            <option value="work">Work</option>
            <option value="home">Home</option>
            <option value="personal">Personal</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted">Due</span>
          <input name="due_at" type="datetime-local" className={inputCls} />
        </label>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose} className={ghostBtn}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "Saving…" : "Save reminder"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="text-xs text-danger bg-danger-soft rounded-md px-3 py-2"
        >
          {error}
        </p>
      )}
    </form>
  );
}
