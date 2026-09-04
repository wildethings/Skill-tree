# Backend

One migration sets up the whole thing: tables, invite-only registration,
row-level security and the photo bucket.

```sh
supabase db push          # or paste 0001_init.sql into the SQL editor
```

Then point the app at the project:

```sh
cp .env.example .env
# VITE_SUPABASE_URL=https://<ref>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon key>
```

With those unset the app runs in local mode instead — same features, data in
IndexedDB on the one device, no account.

## Seeding the first invite

`create_invite()` requires an existing member, so the first code is seeded by
hand in the SQL editor:

```sql
insert into public.invite_codes (code) values ('FIRSTONE');
```

Signing in with a magic link authenticates the account; it does not admit it.
`redeem_invite()` is the only way to get a profile row, and every data policy
requires one — so an uninvited account can hold a session and still read and
write nothing. Members mint further codes from Settings.
