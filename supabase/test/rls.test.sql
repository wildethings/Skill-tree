-- Row-level security, tested at the database layer.
--
-- Application code filtering by user_id proves nothing: it can hide rows while
-- the policies are wide open. These assertions run as the `authenticated` role
-- with a JWT claim, which is exactly how PostgREST executes a REST request, and
-- check what the database itself will hand back.

\set ON_ERROR_STOP on
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'

-- ------------------------------------------------------------------- seed --
reset role;
insert into auth.users (id, email) values
  (:'A', 'a@example.com'), (:'B', 'b@example.com'), (:'C', 'c@example.com');

-- A and B are members. C authenticates but never redeemed an invite.
insert into public.profiles (id, email, display_name) values
  (:'A', 'a@example.com', 'A'), (:'B', 'b@example.com', 'B');

insert into public.nodes (id, user_id, title) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :'A', 'A root'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :'B', 'B root');
insert into public.milestones (id, user_id, node_id, text) values
  ('aaaaaaaa-0000-0000-0000-000000000002', :'A', 'aaaaaaaa-0000-0000-0000-000000000001', 'A milestone'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :'B', 'bbbbbbbb-0000-0000-0000-000000000001', 'B milestone');
insert into public.log_entries (id, user_id, node_id, date, note) values
  ('aaaaaaaa-0000-0000-0000-000000000003', :'A', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', 'A note'),
  ('bbbbbbbb-0000-0000-0000-000000000003', :'B', 'bbbbbbbb-0000-0000-0000-000000000001', '2026-01-01', 'B note');
insert into public.photos (id, user_id, url, width, height) values
  ('aaaaaaaa-0000-0000-0000-000000000004', :'A', 'a.jpg', 10, 10),
  ('bbbbbbbb-0000-0000-0000-000000000004', :'B', 'b.jpg', 10, 10);
insert into public.preferences (user_id, root_order) values
  (:'A', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]),
  (:'B', array['bbbbbbbb-0000-0000-0000-000000000001'::uuid]);
insert into public.invite_codes (code) values ('SECRETCODE');
insert into storage.objects (bucket_id, name) values
  ('photos', :'A' || '/a.jpg'), ('photos', :'B' || '/b.jpg');

-- ------------------------------------ 1. RLS is on for every public table --
do $$
declare t record;
begin
  for t in select tablename, rowsecurity from pg_tables where schemaname = 'public' loop
    if not t.rowsecurity then
      raise exception 'RLS is NOT enabled on public.%', t.tablename;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t.tablename) then
      raise exception 'public.% has RLS on but no policy at all', t.tablename;
    end if;
  end loop;
  if not (select rowsecurity from pg_tables where schemaname = 'storage' and tablename = 'objects') then
    raise exception 'RLS is NOT enabled on storage.objects';
  end if;
  raise notice 'ok   RLS enabled with policies on every table';
end $$;

-- --------------------------------------- 2. A sees only A's rows, never B's --
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare n int; t text;
begin
  foreach t in array array['nodes', 'milestones', 'log_entries', 'photos', 'preferences'] loop
    execute format('select count(*) from public.%I where user_id = %L', t, '22222222-2222-2222-2222-222222222222') into n;
    if n <> 0 then raise exception 'LEAK: A read % of B''s rows from public.%', n, t; end if;

    execute format('select count(*) from public.%I', t) into n;
    if n <> 1 then raise exception 'A should see exactly its own row in public.%, saw %', t, n; end if;
  end loop;
  raise notice 'ok   A reads none of B''s rows in any table';
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then raise exception 'LEAK: A read B''s profile'; end if;
  select count(*) into n from public.invite_codes;
  if n <> 0 then raise exception 'LEAK: A read the invite codes table'; end if;
  raise notice 'ok   profiles and invite codes are not readable across accounts';
end $$;

-- ----------------------------------------- 3. A cannot write over B's rows --
do $$
declare n int;
begin
  with u as (update public.nodes set title = 'hijacked'
             where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1)
  select count(*) into n from u;
  if n <> 0 then raise exception 'LEAK: A updated B''s node'; end if;

  with d as (delete from public.log_entries
             where id = 'bbbbbbbb-0000-0000-0000-000000000003' returning 1)
  select count(*) into n from d;
  if n <> 0 then raise exception 'LEAK: A deleted B''s log entry'; end if;
  raise notice 'ok   A cannot update or delete B''s rows';
end $$;

do $$
begin
  begin
    insert into public.nodes (id, user_id, title)
    values ('aaaaaaaa-0000-0000-0000-00000000000f', '22222222-2222-2222-2222-222222222222', 'planted');
    raise exception 'LEAK: A inserted a row owned by B';
  exception when insufficient_privilege then
    raise notice 'ok   A cannot insert rows owned by B';
  end;
end $$;

-- ------------------------------------------------- 4. storage is isolated --
do $$
declare n int;
begin
  with u as (update storage.objects set name = name
             where name like '22222222%' returning 1)
  select count(*) into n from u;
  if n <> 0 then raise exception 'LEAK: A wrote to B''s storage objects'; end if;

  begin
    insert into storage.objects (bucket_id, name)
    values ('photos', '22222222-2222-2222-2222-222222222222/stolen.jpg');
    raise exception 'LEAK: A uploaded into B''s storage folder';
  exception when insufficient_privilege then
    raise notice 'ok   A cannot write into B''s storage folder';
  end;

  insert into storage.objects (bucket_id, name)
  values ('photos', '11111111-1111-1111-1111-111111111111/mine.jpg');
  raise notice 'ok   A can write into its own storage folder';
end $$;

-- ------------------------------- 4b. photo reads are not public either ----
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare n int;
begin
  select count(*) into n from storage.objects where name like '22222222%';
  if n <> 0 then raise exception 'LEAK: A read % of B''s storage objects', n; end if;
  if (select public from storage.buckets where id = 'photos') then
    raise exception 'the photos bucket is public — a thumbnail URL would be readable by anyone';
  end if;
  raise notice 'ok   the photos bucket is private and B''s objects are not listable by A';
end $$;

-- ----------------------- 5. an authenticated non-member can write nothing --
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
do $$
declare n int;
begin
  select count(*) into n from public.nodes;
  if n <> 0 then raise exception 'LEAK: a non-member read % node rows', n; end if;

  begin
    insert into public.nodes (id, user_id, title)
    values ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'uninvited');
    raise exception 'LEAK: an account with no profile inserted a node';
  exception when insufficient_privilege or foreign_key_violation then
    raise notice 'ok   an authenticated non-member can neither read nor write';
  end;
end $$;

-- --------------------------------------- 6. anonymous reads nothing at all --
reset request.jwt.claims;
set role anon;
do $$
declare n int; t text;
begin
  foreach t in array array['nodes', 'milestones', 'log_entries', 'photos', 'preferences', 'profiles', 'invite_codes'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'LEAK: anonymous read % rows from public.%', n, t; end if;
  end loop;
  raise notice 'ok   anonymous reads nothing from any table';
end $$;

reset role;
