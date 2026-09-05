-- Skill tree — schema, invite-only registration and row-level security.
-- Isolation is enforced here rather than in application code: every table
-- carries user_id and every policy checks it against auth.uid().

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles --
-- A signed-in auth user is not yet a user of the app. Redeeming an invite code
-- creates the profile row, and every data policy below requires one to exist,
-- so an uninvited account can authenticate but can never read or write a thing.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.invite_codes (
  code       text primary key,
  created_by uuid references public.profiles (id) on delete set null,
  used_by    uuid references public.profiles (id) on delete set null,
  used_at    timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- graph --
create table if not exists public.nodes (
  id                uuid primary key,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  title             text not null default '',
  icon              text not null default 'circle-dashed',
  parent_ids        uuid[] not null default '{}',
  primary_parent_id uuid,
  base_color        text,
  state             text not null default 'planned' check (state in ('planned', 'started')),
  offset_dx         real not null default 0,
  offset_dy         real not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  -- baseColor lives only on roots; everything else derives its tint.
  constraint base_color_on_roots_only check (base_color is null or cardinality(parent_ids) = 0),
  -- primaryParentId must be one of parentIds, or null for a root.
  constraint primary_parent_is_a_parent check (
    (cardinality(parent_ids) = 0 and primary_parent_id is null)
    or (primary_parent_id is not null and primary_parent_id = any (parent_ids))
  )
);
create index if not exists nodes_user_idx on public.nodes (user_id) where deleted_at is null;

create table if not exists public.milestones (
  id         uuid primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  node_id    uuid not null references public.nodes (id) on delete cascade,
  text       text not null default '',
  done       boolean not null default false,
  done_at    timestamptz,
  "order"    integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists milestones_node_idx on public.milestones (node_id) where deleted_at is null;

create table if not exists public.log_entries (
  id         uuid primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  node_id    uuid not null references public.nodes (id) on delete cascade,
  -- The date the thing happened. Backdatable, deliberately not created_at.
  date       date not null,
  note       text not null default '',
  photo_ids  uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists log_entries_node_idx on public.log_entries (node_id) where deleted_at is null;
create index if not exists log_entries_user_date_idx on public.log_entries (user_id, date desc);

create table if not exists public.photos (
  id         uuid primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  url        text not null,
  full_url   text,
  width      integer not null default 0,
  height     integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.preferences (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  root_order              uuid[] not null default '{}',
  collapsed_root_ids      uuid[] not null default '{}',
  hidden_stat_ids         text[] not null default '{}',
  stat_order              text[] not null default '{}',
  theme                   text not null default 'system' check (theme in ('light', 'dark', 'system')),
  count_planned_in_stats  boolean not null default true,
  updated_at              timestamptz not null default now()
);

-- --------------------------------------------------------------------- RLS --
alter table public.profiles     enable row level security;
alter table public.invite_codes enable row level security;
alter table public.nodes        enable row level security;
alter table public.milestones   enable row level security;
alter table public.log_entries  enable row level security;
alter table public.photos       enable row level security;
alter table public.preferences  enable row level security;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Invite codes are never listed or written from the client; redeem_invite()
-- is the only path in, and it runs as definer.
drop policy if exists invite_codes_none on public.invite_codes;
create policy invite_codes_none on public.invite_codes for select to authenticated using (false);

do $$
declare t text;
begin
  foreach t in array array['nodes', 'milestones', 'log_entries', 'photos'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format(
      'create policy %I_own on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member())',
      t, t);
  end loop;
end $$;

drop policy if exists preferences_own on public.preferences;
create policy preferences_own on public.preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

-- ------------------------------------------------------------------- RPCs --
-- Registration. Consumes a code atomically; a second caller loses the race.
create or replace function public.redeem_invite(invite_code text, display_name text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  claimed public.invite_codes;
  result  public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into result from public.profiles where id = auth.uid();
  if found then return result; end if;

  update public.invite_codes c
     set used_by = auth.uid(), used_at = now()
   where c.code = upper(btrim(invite_code))
     and c.used_by is null
     and (c.expires_at is null or c.expires_at > now())
  returning * into claimed;

  if not found then
    raise exception 'That invite code is not valid.' using errcode = '22023';
  end if;

  insert into public.profiles (id, email, display_name)
  values (auth.uid(), coalesce((select email from auth.users where id = auth.uid()), ''), coalesce(display_name, ''))
  returning * into result;

  insert into public.preferences (user_id) values (auth.uid()) on conflict do nothing;
  return result;
end $$;

-- Lets a member hand out invites without exposing the codes table.
create or replace function public.create_invite(count integer default 1)
returns setof text language plpgsql security definer set search_path = public as $$
declare i integer; code text;
begin
  if not public.is_member() then raise exception 'Not a member.' using errcode = '42501'; end if;
  for i in 1..greatest(1, least(coalesce(count, 1), 10)) loop
    code := upper(encode(gen_random_bytes(5), 'hex'));
    insert into public.invite_codes (code, created_by) values (code, auth.uid());
    return next code;
  end loop;
end $$;

-- Account deletion. Profile cascade clears the graph; the auth user goes too.
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.redeem_invite(text, text) from public;
revoke all on function public.create_invite(integer) from public;
revoke all on function public.delete_account() from public;
grant execute on function public.redeem_invite(text, text) to authenticated;
grant execute on function public.create_invite(integer) to authenticated;
grant execute on function public.delete_account() to authenticated;

-- ----------------------------------------------------------------- storage --
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Supabase enables RLS on storage.objects by default, but policies on a table
-- without RLS are inert, so never assume it: the whole photo isolation boundary
-- rests on this being on.
do $$
begin
  if not coalesce((select rowsecurity from pg_tables where schemaname = 'storage' and tablename = 'objects'), false) then
    begin
      execute 'alter table storage.objects enable row level security';
    exception when insufficient_privilege then
      raise warning 'Could not enable RLS on storage.objects. Turn it on under Storage -> Policies before uploading anything.';
    end;
  end if;
end $$;

-- Photos live under <user id>/..., so the path prefix is the isolation boundary.
drop policy if exists photos_own_write on storage.objects;
create policy photos_own_write on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists photos_public_read on storage.objects;
create policy photos_public_read on storage.objects for select to public
  using (bucket_id = 'photos');

-- -------------------------------------------------------------------- sync --
-- Last-write-wins per record, resolved on the server so a stale client (or a
-- mutation replayed from an offline outbox) can never clobber a newer row.
-- Every branch re-checks user_id, so RLS still applies through the definer.
create or replace function public.sync_push(rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb; uid uuid := auth.uid();
begin
  if uid is null or not public.is_member() then
    raise exception 'Not a member.' using errcode = '42501';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    if (r ->> 'user_id')::uuid is distinct from uid then
      raise exception 'Row does not belong to you.' using errcode = '42501';
    end if;

    case r ->> '_table'
      when 'nodes' then
        insert into public.nodes (id, user_id, title, icon, parent_ids, primary_parent_id, base_color,
                                  state, offset_dx, offset_dy, created_at, updated_at, deleted_at)
        select (r ->> 'id')::uuid, uid, r ->> 'title', r ->> 'icon',
               coalesce((select array_agg(value::text::uuid) from jsonb_array_elements_text(r -> 'parent_ids') as value), '{}'),
               nullif(r ->> 'primary_parent_id', '')::uuid, r ->> 'base_color', r ->> 'state',
               (r ->> 'offset_dx')::real, (r ->> 'offset_dy')::real,
               (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz,
               nullif(r ->> 'deleted_at', '')::timestamptz
        on conflict (id) do update set
          title = excluded.title, icon = excluded.icon, parent_ids = excluded.parent_ids,
          primary_parent_id = excluded.primary_parent_id, base_color = excluded.base_color,
          state = excluded.state, offset_dx = excluded.offset_dx, offset_dy = excluded.offset_dy,
          updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
        where nodes.user_id = uid and excluded.updated_at >= nodes.updated_at;

      when 'milestones' then
        insert into public.milestones (id, user_id, node_id, text, done, done_at, "order", updated_at, deleted_at)
        select (r ->> 'id')::uuid, uid, (r ->> 'node_id')::uuid, r ->> 'text', (r ->> 'done')::boolean,
               nullif(r ->> 'done_at', '')::timestamptz, (r ->> 'order')::integer,
               (r ->> 'updated_at')::timestamptz, nullif(r ->> 'deleted_at', '')::timestamptz
        on conflict (id) do update set
          text = excluded.text, done = excluded.done, done_at = excluded.done_at,
          "order" = excluded."order", updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
        where milestones.user_id = uid and excluded.updated_at >= milestones.updated_at;

      when 'log_entries' then
        insert into public.log_entries (id, user_id, node_id, date, note, photo_ids, created_at, updated_at, deleted_at)
        select (r ->> 'id')::uuid, uid, (r ->> 'node_id')::uuid, (r ->> 'date')::date, r ->> 'note',
               coalesce((select array_agg(value::text::uuid) from jsonb_array_elements_text(r -> 'photo_ids') as value), '{}'),
               (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz,
               nullif(r ->> 'deleted_at', '')::timestamptz
        on conflict (id) do update set
          date = excluded.date, note = excluded.note, photo_ids = excluded.photo_ids,
          updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
        where log_entries.user_id = uid and excluded.updated_at >= log_entries.updated_at;

      when 'photos' then
        insert into public.photos (id, user_id, url, full_url, width, height, created_at)
        select (r ->> 'id')::uuid, uid, r ->> 'url', nullif(r ->> 'full_url', ''),
               (r ->> 'width')::integer, (r ->> 'height')::integer, (r ->> 'created_at')::timestamptz
        on conflict (id) do nothing;

      when 'preferences' then
        insert into public.preferences (user_id, root_order, collapsed_root_ids, hidden_stat_ids,
                                        stat_order, theme, count_planned_in_stats, updated_at)
        select uid,
               coalesce((select array_agg(value::text::uuid) from jsonb_array_elements_text(r -> 'root_order') as value), '{}'),
               coalesce((select array_agg(value::text::uuid) from jsonb_array_elements_text(r -> 'collapsed_root_ids') as value), '{}'),
               coalesce((select array_agg(value::text) from jsonb_array_elements_text(r -> 'hidden_stat_ids') as value), '{}'),
               coalesce((select array_agg(value::text) from jsonb_array_elements_text(r -> 'stat_order') as value), '{}'),
               r ->> 'theme', (r ->> 'count_planned_in_stats')::boolean, (r ->> 'updated_at')::timestamptz
        on conflict (user_id) do update set
          root_order = excluded.root_order, collapsed_root_ids = excluded.collapsed_root_ids,
          hidden_stat_ids = excluded.hidden_stat_ids, stat_order = excluded.stat_order,
          theme = excluded.theme, count_planned_in_stats = excluded.count_planned_in_stats,
          updated_at = excluded.updated_at
        where preferences.user_id = uid and excluded.updated_at >= preferences.updated_at;

      else raise exception 'Unknown table %', r ->> '_table';
    end case;
  end loop;
end $$;

revoke all on function public.sync_push(jsonb) from public;
grant execute on function public.sync_push(jsonb) to authenticated;
