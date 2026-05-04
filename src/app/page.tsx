import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/reminders");

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,color-mix(in_oklab,var(--brand)_25%,transparent),transparent_55%),radial-gradient(circle_at_85%_100%,color-mix(in_oklab,var(--brand)_18%,transparent),transparent_60%)]"
      />
      <div className="w-full max-w-sm space-y-8 animate-in">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-brand text-brand-foreground grid place-items-center text-2xl font-semibold shadow-lg shadow-brand/30 ring-1 ring-black/5">
            R
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome to Remi
            </h1>
            <p className="text-sm text-muted">
              Reminders that actually remind you.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-background-elevated/80 backdrop-blur p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="text-center text-xs text-muted">
          We&apos;ll email you a magic link — no password needed.
        </p>
      </div>
    </main>
  );
}
