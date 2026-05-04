"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, email, password }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setPending(false);
      setError(data?.error ?? "Could not log you in. Try again.");
      return;
    }

    router.replace("/reminders");
    router.refresh();
  }

  const isSignUp = mode === "signup";

  return (
    <form onSubmit={onSubmit} className="space-y-3" autoComplete="on">
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

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">Password</span>
        <input
          type="password"
          required
          minLength={isSignUp ? 8 : undefined}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder={isSignUp ? "At least 8 characters" : "Your password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-background-elevated px-3 py-2.5 text-sm transition-colors placeholder:text-muted/70"
        />
      </label>

      <button
        type="submit"
        disabled={pending || !email || !password}
        className="w-full rounded-lg bg-brand text-brand-foreground px-3 py-2.5 text-sm font-medium shadow-sm shadow-brand/30 transition-all hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending
          ? isSignUp
            ? "Registering…"
            : "Logging in…"
          : isSignUp
            ? "Register"
            : "Login"}
      </button>

      {error && (
        <p
          role="alert"
          className="text-xs text-danger bg-danger-soft rounded-md px-3 py-2"
        >
          {error}
        </p>
      )}

      <p className="text-center text-xs text-muted pt-1">
        {isSignUp ? "Already have an account?" : "First time here?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(isSignUp ? "signin" : "signup");
            setError(null);
          }}
          className="text-brand hover:underline underline-offset-4 font-medium"
        >
          {isSignUp ? "Login" : "Register"}
        </button>
      </p>
    </form>
  );
}
