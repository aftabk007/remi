"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="space-y-3 text-center animate-in">
        <div className="mx-auto h-12 w-12 rounded-full bg-success-soft text-success grid place-items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden
          >
            <path d="M4 12l5 5L20 6" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Check your inbox</p>
          <p className="text-sm text-muted break-words">
            We sent a magic link to <strong>{email}</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
          }}
          className="text-xs text-muted hover:text-foreground underline-offset-4 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">Email</span>
        <input
          type="email"
          required
          autoFocus
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-background-elevated px-3 py-2.5 text-sm transition-colors placeholder:text-muted/70"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending" || !email}
        className="w-full rounded-lg bg-brand text-brand-foreground px-3 py-2.5 text-sm font-medium shadow-sm shadow-brand/30 transition-all hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "sending" ? "Sending magic link…" : "Send magic link"}
      </button>
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
