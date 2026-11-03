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
