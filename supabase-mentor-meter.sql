-- ============================================================
-- With Little — Stewardship Mentor meter (server-authoritative)
-- Run in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- The meter must NOT live in app_data: app_data is writable by the
-- user under RLS (the server previously used the anon key and acted
-- AS the user), so a user could set their own balance from the
-- browser console. This table is writable ONLY by the service role.
--
-- The daily reset flips at 4am America/Central, DST-safe. We use the
-- NAMED zone (not a fixed hour offset) because Central is UTC-6 in
-- winter and UTC-5 in summer — a fixed offset would break twice a year.
-- Central is the single source of truth for ALL users; we do NOT read a
-- timezone from the request body. A future per-user timezone would swap
-- only the reset expression below (the ((now() AT TIME ZONE ...)) line)
-- for a per-row zone; nothing else changes.
-- ============================================================

create table if not exists public.mentor_meter (
  user_id      uuid primary key references auth.users on delete cascade,
  balance      integer     not null default 20,
  -- "today" = the 4am-Central stewardship day (see header note)
  reset_date   date        not null default ((now() at time zone 'America/Chicago') - interval '4 hours')::date,
  window_start timestamptz,
  window_count integer     not null default 0,
  updated_at   timestamptz not null default now()
);

-- ── RLS: user may read their own row; only the service role writes ──
alter table public.mentor_meter enable row level security;

drop policy if exists "mentor_meter select own" on public.mentor_meter;
create policy "mentor_meter select own" on public.mentor_meter
  for select using (auth.uid() = user_id);
-- No insert / update / delete policies → those are denied for anon &
-- authenticated even with a table grant. The service role bypasses RLS.

-- ── Explicit grant lock-down (Supabase auto-grants anon/authenticated on
--    public tables, so strip them and hand back only read to authenticated;
--    RLS still limits that read to the user's own row). ──
revoke all on table public.mentor_meter from anon, authenticated;
grant select on table public.mentor_meter to authenticated;

-- ── Atomic reserve: rate-limit check + balance decrement in one statement ──
-- Returns exactly one row. `allowed` false with balance 0 = out of messages;
-- `rate_limited` true = too many in the last minute (balance untouched).
-- reset_date/window are recomputed from server time — client cannot influence.
-- A brand-new user is upserted with a FULL balance, so their first call
-- decrements to allowance-1 and is allowed (never born at zero).
create or replace function public.mentor_reserve(
  p_user_id   uuid,
  p_allowance integer,
  p_rate_limit integer
)
returns table(balance integer, allowed boolean, rate_limited boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The 4am-Central stewardship day. DST-safe named zone; NOT a fixed offset.
  -- (Future per-user tz: replace 'America/Chicago' with the user's zone.)
  v_today date := ((now() at time zone 'America/Chicago') - interval '4 hours')::date;
  v_bal   integer;
  v_reset date;
  v_wstart timestamptz;
  v_wcount integer;
begin
  -- Upsert a fresh full-balance row for a user who has never had one.
  insert into public.mentor_meter as m (user_id, balance, reset_date, window_start, window_count)
    values (p_user_id, p_allowance, v_today, now(), 0)
    on conflict (user_id) do nothing;

  select m.balance, m.reset_date, m.window_start, m.window_count
    into v_bal, v_reset, v_wstart, v_wcount
    from public.mentor_meter m
    where m.user_id = p_user_id
    for update;

  -- Daily reset (4am Central, DST-safe)
  if v_reset is distinct from v_today then
    v_bal := p_allowance;
    v_reset := v_today;
    v_wstart := null;
    v_wcount := 0;
  end if;

  -- Rate-limit window (rolling 60s)
  if v_wstart is null or now() - v_wstart > interval '60 seconds' then
    v_wstart := now();
    v_wcount := 0;
  end if;

  if v_wcount >= p_rate_limit then
    update public.mentor_meter m
      set reset_date = v_reset, window_start = v_wstart,
          window_count = v_wcount, updated_at = now()
      where m.user_id = p_user_id;
    return query select v_bal, false, true;
    return;
  end if;

  if v_bal <= 0 then
    update public.mentor_meter m
      set balance = 0, reset_date = v_reset, window_start = v_wstart,
          window_count = v_wcount, updated_at = now()
      where m.user_id = p_user_id;
    return query select 0, false, false;
    return;
  end if;

  -- Reserve one message before Claude is ever called
  v_bal := v_bal - 1;
  v_wcount := v_wcount + 1;
  update public.mentor_meter m
    set balance = v_bal, reset_date = v_reset, window_start = v_wstart,
        window_count = v_wcount, updated_at = now()
    where m.user_id = p_user_id;

  return query select v_bal, true, false;
end;
$$;

-- ── Refund: only called when the Anthropic call fails before any tokens ──
create or replace function public.mentor_refund(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mentor_meter m
    set balance = m.balance + 1,
        window_count = greatest(0, m.window_count - 1),
        updated_at = now()
    where m.user_id = p_user_id;
end;
$$;

-- Lock the RPCs down to the service role (the serverless function) only.
-- Supabase's default execute-grant to anon/authenticated is revoked explicitly
-- so production matches the locked-down intent, not just the local shim.
revoke all on function public.mentor_reserve(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.mentor_refund(uuid) from public, anon, authenticated;
grant execute on function public.mentor_reserve(uuid, integer, integer) to service_role;
grant execute on function public.mentor_refund(uuid) to service_role;
