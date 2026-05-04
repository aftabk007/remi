-- Remi initial schema
-- Run this in Supabase Dashboard → SQL Editor

create extension if not exists "pgcrypto";

create type reminder_status as enum ('pending', 'done', 'snoozed', 'cancelled');
create type reminder_category as enum ('work', 'home', 'personal');

create table reminders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  notes           text,
  category        reminder_category not null default 'personal',
  status          reminder_status   not null default 'pending',
  due_at          timestamptz,                 -- one-shot deadline
  rrule           text,                        -- RFC 5545 recurrence (null = one-shot)
  next_fire_at    timestamptz,                 -- when scheduler should fire next
  snoozed_until   timestamptz,
  channels        text[] not null default '{web_push}', -- web_push | discord | email
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index reminders_user_idx on reminders (user_id);
create index reminders_fire_idx on reminders (next_fire_at) where status = 'pending';

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create table notification_log (
  id           uuid primary key default gen_random_uuid(),
  reminder_id  uuid not null references reminders(id) on delete cascade,
  channel      text not null,
  success      boolean not null,
  error        text,
  sent_at      timestamptz not null default now()
);

create index notification_log_reminder_idx on notification_log (reminder_id, sent_at desc);

-- Per-user settings (Discord webhook, default channels, timezone, etc.)
create table user_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  timezone             text not null default 'Asia/Karachi',
  discord_webhook_url  text,
  default_channels     text[] not null default '{web_push}',
  updated_at           timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger reminders_set_updated_at before update on reminders
  for each row execute function set_updated_at();

create trigger user_settings_set_updated_at before update on user_settings
  for each row execute function set_updated_at();

-- Row-Level Security: every user only sees their own data
alter table reminders            enable row level security;
alter table push_subscriptions   enable row level security;
alter table notification_log     enable row level security;
alter table user_settings        enable row level security;

create policy "own reminders" on reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own push subs" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own logs read" on notification_log
  for select using (
    exists (select 1 from reminders r where r.id = notification_log.reminder_id and r.user_id = auth.uid())
  );

create policy "own settings" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
