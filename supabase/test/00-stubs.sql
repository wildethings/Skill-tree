-- Minimal stand-ins for the pieces Supabase provides, so the migration can be
-- applied to a plain Postgres and its policies tested for real.
--
-- These are NOT part of the migration and must never be run against a Supabase
-- project — they exist only so `auth.uid()`, `auth.users` and the storage
-- tables resolve outside it. Everything under `public` is the real thing.

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- Supabase derives auth.uid() from the request JWT. Same contract here.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text not null,
  owner     uuid
);

-- Splits an object name into path segments, as Supabase's does.
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

-- PostgREST connects as these roles; policies are written `to authenticated`.
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

grant usage on schema public, auth, storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
-- Supabase grants these on the storage tables; RLS, not the grant, is what
-- isolates one account's objects from another's.
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
