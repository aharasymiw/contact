-- PostgreSQL 18 lets us use uuidv7() directly, which is a nice talking point in
-- an educational codebase because identifiers stay globally unique and sort
-- roughly by creation time.

create table if not exists app_users (
  id uuid primary key default uuidv7(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists user_sessions (
  id uuid primary key default uuidv7(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists user_sessions_user_id_idx on user_sessions(user_id);
create index if not exists user_sessions_expires_at_idx on user_sessions(expires_at);

create table if not exists call_sessions (
  id uuid primary key default uuidv7(),
  caller_user_id uuid not null references app_users(id) on delete cascade,
  callee_user_id uuid not null references app_users(id) on delete cascade,
  status text not null check (status in ('ringing', 'accepted', 'rejected', 'ended')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

create index if not exists call_sessions_caller_user_id_idx on call_sessions(caller_user_id);
create index if not exists call_sessions_callee_user_id_idx on call_sessions(callee_user_id);
create index if not exists call_sessions_status_idx on call_sessions(status);

create table if not exists call_events (
  id bigint generated always as identity primary key,
  call_session_id uuid not null references call_sessions(id) on delete cascade,
  actor_user_id uuid references app_users(id) on delete set null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists call_events_call_session_id_idx on call_events(call_session_id);
create index if not exists call_events_event_type_idx on call_events(event_type);
