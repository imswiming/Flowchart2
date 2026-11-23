-- One-time setup for email sign-in (run in Supabase: SQL Editor > New query > Run).
-- Each signed-in account can only see and change its own rows:
--   <account id>                  the flowchart list
--   <account id>::img::<hash>     pictures
--   <account id>::globalnotes     global notes

create table if not exists flowchart_sync (
  id text primary key,
  updated_at bigint,
  data jsonb
);

alter table flowchart_sync enable row level security;

-- Remove the old "anyone with the key can read everything" policy.
drop policy if exists "allow all" on flowchart_sync;
drop policy if exists "own rows" on flowchart_sync;

create policy "own rows" on flowchart_sync
  for all to authenticated
  using      (id = auth.uid()::text or id like auth.uid()::text || '::%')
  with check (id = auth.uid()::text or id like auth.uid()::text || '::%');

-- Optional: lets the storage-used bar show the exact database size.
create or replace function get_db_size()
returns bigint
language sql
security definer
set search_path = ''
as $$ select pg_database_size(current_database()) $$;
grant execute on function get_db_size() to authenticated;

-- Also in Supabase (Dashboard):
--  * Authentication > Providers > Email: enabled ("Confirm email" can stay on).
--  * Authentication > URL Configuration: set Site URL to this app's address and add
--    it under Redirect URLs, so the link in the email brings you back here.
--  * Authentication > Emails: add "Your code: {{ .Token }}" to the Magic Link and
--    Confirm signup templates, so the code can be typed in as well as clicked.
--
-- Optional: move the flowcharts of an old Sync ID to your new account (after your
-- first sign-in; the account id is shown in Authentication > Users):
--   update flowchart_sync set id = replace(id, '<old sync id>', '<account id>')
--   where id like '<old sync id>%';

-- =====================================================================
-- Sharing a flowchart with other people (Manage access / invite codes)
-- =====================================================================
-- Run this part too (running the whole file again is safe). Also in Supabase:
--  * Authentication > Sign In / Providers: turn on "Allow anonymous sign-ins".
--    That's how someone joins with just a code - no account, no Supabase of
--    their own; they use this project as a guest.
--  * Authentication > Emails > "Change Email Address": add "Your code: {{ .Token }}",
--    so a guest who adds their email can type the code in.
--
-- How it fits together:
--   flowchart_shares    one row per shared flowchart (who owns it)
--   flowchart_members   who can open it - owner / edit / view - and their name
--   flowchart_invites   one-use codes. Claiming one adds the person and marks the
--                       code used in a single statement, so two people can never
--                       both claim it, and a forwarded code is dead once used.
--   flowchart_devices   every device each person has used, with last seen
--   flowchart_sync      rows 'share::<share id>' (the flowchart, its notes
--                       included) and 'share::<share id>::img::<hash>' (its
--                       pictures): members can read them, owner/edit can write.
--                       Members never get at anything else of the owner's - no
--                       global notes, no other flowcharts.

create table if not exists flowchart_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists flowchart_members (
  share_id uuid not null references flowchart_shares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'edit', 'view')),
  name text,
  invite_label text,
  joined_at timestamptz not null default now(),
  primary key (share_id, user_id)
);
create index if not exists flowchart_members_user on flowchart_members (user_id);

create table if not exists flowchart_invites (
  code text primary key,
  share_id uuid not null references flowchart_shares(id) on delete cascade,
  role text not null check (role in ('edit', 'view')),
  label text,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index if not exists flowchart_invites_share on flowchart_invites (share_id);

create table if not exists flowchart_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table flowchart_shares enable row level security;
alter table flowchart_members enable row level security;
alter table flowchart_invites enable row level security;
alter table flowchart_devices enable row level security;

-- The signed-in person's role in a share (null = not a member).
create or replace function flowchart_share_role(p_share uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from public.flowchart_members where share_id = p_share and user_id = auth.uid()
$$;

-- 'share::<uuid>' or 'share::<uuid>::...' gives the uuid; anything else gives null.
create or replace function flowchart_share_of(p_id text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when p_id ~ '^share::[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(::|$)'
    then substr(p_id, 8, 36)::uuid end
$$;

-- Shared flowchart rows (alongside "own rows" above).
drop policy if exists "shared read" on flowchart_sync;
drop policy if exists "shared insert" on flowchart_sync;
drop policy if exists "shared update" on flowchart_sync;
drop policy if exists "shared delete" on flowchart_sync;
create policy "shared read" on flowchart_sync for select to authenticated
  using (public.flowchart_share_role(public.flowchart_share_of(id)) is not null);
create policy "shared insert" on flowchart_sync for insert to authenticated
  with check (public.flowchart_share_role(public.flowchart_share_of(id)) in ('owner', 'edit'));
create policy "shared update" on flowchart_sync for update to authenticated
  using (public.flowchart_share_role(public.flowchart_share_of(id)) in ('owner', 'edit'))
  with check (public.flowchart_share_role(public.flowchart_share_of(id)) in ('owner', 'edit'));
create policy "shared delete" on flowchart_sync for delete to authenticated
  using (public.flowchart_share_role(public.flowchart_share_of(id)) = 'owner');

drop policy if exists "members see share" on flowchart_shares;
drop policy if exists "owner deletes share" on flowchart_shares;
create policy "members see share" on flowchart_shares for select to authenticated
  using (public.flowchart_share_role(id) is not null);
create policy "owner deletes share" on flowchart_shares for delete to authenticated
  using (owner_id = auth.uid());

-- Everyone sees their own memberships; the owner sees everyone's. The owner can
-- switch a guest between view and edit, or remove them; a guest can leave.
-- Nobody adds members directly - only flowchart_claim_invite does.
drop policy if exists "members read" on flowchart_members;
drop policy if exists "owner changes role" on flowchart_members;
drop policy if exists "remove member" on flowchart_members;
create policy "members read" on flowchart_members for select to authenticated
  using (user_id = auth.uid() or public.flowchart_share_role(share_id) = 'owner');
create policy "owner changes role" on flowchart_members for update to authenticated
  using (public.flowchart_share_role(share_id) = 'owner' and role <> 'owner')
  with check (role in ('edit', 'view'));
create policy "remove member" on flowchart_members for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.flowchart_share_role(share_id) = 'owner'));

drop policy if exists "owner reads invites" on flowchart_invites;
drop policy if exists "owner revokes invites" on flowchart_invites;
create policy "owner reads invites" on flowchart_invites for select to authenticated
  using (public.flowchart_share_role(share_id) = 'owner');
create policy "owner revokes invites" on flowchart_invites for delete to authenticated
  using (public.flowchart_share_role(share_id) = 'owner' and used_by is null);

drop policy if exists "own devices" on flowchart_devices;
create policy "own devices" on flowchart_devices for select to authenticated
  using (user_id = auth.uid());

-- Records the device the signed-in person is on, or refreshes its "last seen".
create or replace function flowchart_register_device(p_device_id text, p_device_name text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(p_device_id, '') = '' then return; end if;
  insert into public.flowchart_devices (user_id, device_id, device_name)
  values (auth.uid(), left(p_device_id, 64), left(nullif(trim(p_device_name), ''), 80))
  on conflict (user_id, device_id) do update
    set last_seen = now(),
        device_name = coalesce(excluded.device_name, public.flowchart_devices.device_name);
end $$;

-- Starts sharing a flowchart: makes the share and its owner. Email accounts only.
create or replace function flowchart_create_share(p_name text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with your email to share your own flowcharts.';
  end if;
  insert into public.flowchart_shares (owner_id) values (auth.uid()) returning id into sid;
  insert into public.flowchart_members (share_id, user_id, role, name)
  values (sid, auth.uid(), 'owner', left(nullif(trim(p_name), ''), 80));
  return sid;
end $$;

-- A new one-use code: 8 characters, without 0/O/1/I. Owner only.
create or replace function flowchart_create_invite(p_share uuid, p_role text, p_label text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea;
  c text;
  i int;
begin
  if public.flowchart_share_role(p_share) is distinct from 'owner' then
    raise exception 'Only the owner can invite people.';
  end if;
  if p_role is null or p_role not in ('edit', 'view') then raise exception 'Choose view or edit.'; end if;
  loop
    -- Random bytes from a v4 uuid (skipping its fixed version/variant bytes).
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    c := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
      c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.flowchart_invites (code, share_id, role, label)
      values (c, p_share, p_role, left(nullif(trim(p_label), ''), 80));
      return c;
    exception when unique_violation then
      -- that code exists already - draw another
    end;
  end loop;
end $$;

-- Joining with a code. The UPDATE only matches while the code is unused, and
-- Postgres re-checks that after waiting out any other claim of the same row, so
-- exactly one person gets in per code. (The same person re-sending the request,
-- e.g. after a dropped connection, is let through.)
create or replace function flowchart_claim_invite(p_code text, p_name text, p_device_id text, p_device_name text)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  inv public.flowchart_invites;
  norm text;
  existing text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  update public.flowchart_invites
     set used_by = auth.uid(), used_at = coalesce(used_at, now())
   where code = norm and (used_by is null or used_by = auth.uid())
  returning * into inv;
  if not found then
    raise exception 'That code isn''t valid or has already been used. Ask the owner for a new one.';
  end if;
  select role into existing from public.flowchart_members
   where share_id = inv.share_id and user_id = auth.uid();
  if existing is null then
    insert into public.flowchart_members (share_id, user_id, role, name, invite_label)
    values (inv.share_id, auth.uid(), inv.role, left(coalesce(nullif(trim(p_name), ''), inv.label), 80), inv.label);
  elsif existing <> 'owner' then
    update public.flowchart_members
       set role = inv.role, name = coalesce(left(nullif(trim(p_name), ''), 80), name)
     where share_id = inv.share_id and user_id = auth.uid();
  end if;
  perform public.flowchart_register_device(p_device_id, p_device_name);
  return json_build_object('share_id', inv.share_id,
                           'role', case when existing = 'owner' then 'owner' else inv.role end);
end $$;

-- Everything the Manage access panel shows: each person with their name, email
-- (once they've added one) and every device they've used. Owner only.
create or replace function flowchart_share_access(p_share uuid)
returns json
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.flowchart_share_role(p_share) is distinct from 'owner' then
    raise exception 'Only the owner can manage access.';
  end if;
  return json_build_object(
    'members', coalesce((
      select json_agg(json_build_object(
        'user_id', m.user_id, 'role', m.role, 'name', m.name, 'invite_label', m.invite_label,
        'joined_at', m.joined_at, 'email', u.email, 'anonymous', coalesce(u.is_anonymous, false),
        'devices', coalesce((
          select json_agg(json_build_object('name', d.device_name, 'first_seen', d.first_seen, 'last_seen', d.last_seen)
                          order by d.last_seen desc)
            from public.flowchart_devices d where d.user_id = m.user_id), '[]'::json)
      ) order by (m.role = 'owner') desc, m.joined_at)
      from public.flowchart_members m left join auth.users u on u.id = m.user_id
      where m.share_id = p_share), '[]'::json),
    'invites', coalesce((
      select json_agg(json_build_object('code', i.code, 'role', i.role, 'label', i.label, 'created_at', i.created_at)
                      order by i.created_at desc)
      from public.flowchart_invites i where i.share_id = p_share and i.used_by is null), '[]'::json)
  );
end $$;

revoke execute on function flowchart_register_device(text, text) from public, anon;
revoke execute on function flowchart_create_share(text) from public, anon;
revoke execute on function flowchart_create_invite(uuid, text, text) from public, anon;
revoke execute on function flowchart_claim_invite(text, text, text, text) from public, anon;
revoke execute on function flowchart_share_access(uuid) from public, anon;
grant execute on function flowchart_register_device(text, text) to authenticated;
grant execute on function flowchart_create_share(text) to authenticated;
grant execute on function flowchart_create_invite(uuid, text, text) to authenticated;
grant execute on function flowchart_claim_invite(text, text, text, text) to authenticated;
grant execute on function flowchart_share_access(uuid) to authenticated;
