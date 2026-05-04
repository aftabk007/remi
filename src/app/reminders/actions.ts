"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseReminder, type ParsedReminder } from "@/lib/llm";

export async function createReminder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "personal");
  const due = String(formData.get("due_at") ?? "");
  const due_at = due ? new Date(due).toISOString() : null;

  if (!title) throw new Error("Title required");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("default_channels")
    .maybeSingle();
  const channels = settings?.default_channels ?? ["web_push"];

  const { error } = await supabase.from("reminders").insert({
    user_id: user.id,
    title,
    notes,
    category,
    due_at,
    next_fire_at: due_at,
    channels,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/reminders");
}

export async function parseWithAI(text: string): Promise<ParsedReminder> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("timezone")
    .maybeSingle();
  const timezone = settings?.timezone ?? "Asia/Karachi";

  return parseReminder(text, {
    currentTime: new Date().toISOString(),
    timezone,
  });
}

export async function createFromParsed(p: ParsedReminder) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("default_channels")
    .maybeSingle();
  const channels = settings?.default_channels ?? ["web_push"];

  const { error } = await supabase.from("reminders").insert({
    user_id: user.id,
    title: p.title,
    notes: p.notes,
    category: p.category,
    due_at: p.due_at,
    next_fire_at: p.due_at,
    rrule: p.rrule,
    channels,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/reminders");
}

export async function setReminderStatus(id: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reminders");
}

export async function deleteReminder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reminders");
}
