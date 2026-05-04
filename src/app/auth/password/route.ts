import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type AuthMode = "signin" | "signup";

type AuthBody = {
  mode?: AuthMode;
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  let body: AuthBody;

  try {
    body = await request.json();
  } catch {
    return jsonError("Send an email and password.", 400);
  }

  const mode = body.mode;
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (mode !== "signin" && mode !== "signup") {
    return jsonError("Choose login or register.", 400);
  }

  if (!email || !password) {
    return jsonError("Enter your email and password.", 400);
  }

  if (mode === "signup" && password.length < 8) {
    return jsonError("Password must be at least 8 characters.", 400);
  }

  if (mode === "signup") {
    const signupError = await createConfirmedUser(email, password);

    if (signupError) {
      return jsonError(prettyError(signupError, mode), 400);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return jsonError(prettyError(error.message, mode), 401);
  }

  return NextResponse.json({ ok: true });
}

async function createConfirmedUser(email: string, password: string) {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    return "Registration is not configured yet. Add SUPABASE_SECRET_KEY on the server.";
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  return error?.message ?? null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function prettyError(message: string, mode: AuthMode): string {
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Wrong email or password.";
  }

  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("already exists") ||
    lower.includes("duplicate")
  ) {
    return "That email is already registered. Try login instead.";
  }

  if (lower.includes("email not confirmed")) {
    return "This account still needs email confirmation in Supabase. Register again or disable email confirmations.";
  }

  if (lower.includes("password") && lower.includes("characters")) {
    return "Password must be at least 8 characters.";
  }

  if (mode === "signup" && lower.includes("rate")) {
    return "Too many registrations from this device. Try again in a few minutes.";
  }

  return message;
}
