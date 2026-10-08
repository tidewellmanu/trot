-- TrotroMall: make newly posted active listings publicly discoverable.
-- Run this on Supabase project zqchpfdrtlfcokwmorln.

alter table public.listings enable row level security;

drop policy if exists "listings_public_read_active" on public.listings;

create policy "listings_public_read_active"
on public.listings
for select
to anon, authenticated
using (status = 'active');

-- Keep the public RPC used by older clients/API consumers available.
create or replace function public.get_public_active_listings()
returns setof public.listings
language sql
security invoker
set search_path = public
stable
as $$
  select *
  from public.listings
  where status = 'active'
  order by created_at desc;
$$;

revoke all on function public.get_public_active_listings() from public;
grant execute on function public.get_public_active_listings() to anon, authenticated;
