import type { CookieOptionsWithName } from "@supabase/ssr";

export const ONE_MONTH_IN_SECONDS = 60 * 60 * 24 * 30;

export const supabaseCookieOptions = {
  maxAge: ONE_MONTH_IN_SECONDS,
  path: "/",
  sameSite: "lax",
} satisfies CookieOptionsWithName;
