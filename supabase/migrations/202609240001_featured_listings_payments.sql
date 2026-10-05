-- TrotroMall production Supabase migration
-- Featured listing monetisation: GHS 50 / 7 days

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

alter table public.listings
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_until timestamptz null;

create index if not exists listings_featured_priority_idx
  on public.listings (is_featured desc, created_at desc);
create index if not exists listings_featured_until_idx
  on public.listings (featured_until)
  where is_featured = true;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete cascade,
  client_reference text not null unique,
  hubtel_transaction_id text null,
  amount numeric(10,2) not null default 50.00,
  currency text not null default 'GHS',
  payment_status text not null default 'pending',
  channel text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amount_fixed check (amount = 50.00),
  constraint payments_currency_fixed check (currency = 'GHS'),
  constraint payments_status_check check (payment_status in ('pending','completed','failed'))
);

create index if not exists payments_user_idx on public.payments(user_id, created_at desc);
create index if not exists payments_listing_idx on public.payments(listing_id, created_at desc);
create index if not exists payments_status_idx on public.payments(payment_status, created_at desc);
create unique index if not exists payments_hubtel_transaction_unique
  on public.payments(hubtel_transaction_id)
  where hubtel_transaction_id is not null;

create or replace function public.set_payments_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
before update on public.payments
for each row execute function public.set_payments_updated_at();

-- Atomic, idempotent payment completion. The webhook never directly trusts a browser.
create or replace function public.complete_feature_payment(
  p_client_reference text,
  p_hubtel_transaction_id text,
  p_channel text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_listing public.listings%rowtype;
  v_until timestamptz;
begin
  if p_amount <> 50.00 then
    raise exception 'Invalid payment amount';
  end if;

  select * into v_payment
  from public.payments
  where client_reference = p_client_reference
  for update;

  if not found then
    raise exception 'Payment reference not found';
  end if;

  if v_payment.amount <> 50.00 or v_payment.currency <> 'GHS' then
    raise exception 'Payment ledger validation failed';
  end if;

  if v_payment.payment_status = 'completed' then
    return jsonb_build_object('ok', true, 'already_completed', true, 'listing_id', v_payment.listing_id);
  end if;

  select * into v_listing
  from public.listings
  where id = v_payment.listing_id
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  -- If an existing promotion is still active, extend from its current expiry;
  -- otherwise start the seven-day window from now.
  v_until := greatest(coalesce(v_listing.featured_until, now()), now()) + interval '7 days';

  update public.payments
  set payment_status = 'completed',
      hubtel_transaction_id = coalesce(p_hubtel_transaction_id, hubtel_transaction_id),
      channel = coalesce(nullif(p_channel, ''), channel),
      updated_at = now()
  where id = v_payment.id;

  update public.listings
  set is_featured = true,
      featured_until = v_until
  where id = v_payment.listing_id;

  return jsonb_build_object('ok', true, 'already_completed', false, 'listing_id', v_payment.listing_id, 'featured_until', v_until);
end;
$$;

revoke all on function public.complete_feature_payment(text,text,text,numeric) from public, anon, authenticated;
grant execute on function public.complete_feature_payment(text,text,text,numeric) to service_role;

-- Daily cleanup function. It is deliberately idempotent.
create or replace function public.expire_featured_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.listings
  set is_featured = false
  where is_featured = true
    and featured_until is not null
    and featured_until < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_featured_listings() from public, anon, authenticated;
grant execute on function public.expire_featured_listings() to service_role;

-- Public discovery view: expired promotions can never remain pinned.
create or replace view public.marketplace_discovery as
select
  l.*,
  (l.is_featured = true and l.featured_until > now()) as active_featured
from public.listings l
where coalesce(l.status, 'active') = 'active';

-- RLS: users may see their own payment records; no public ledger access.
alter table public.payments enable row level security;
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
on public.payments for select
using (auth.uid() = user_id);

-- Inserts/updates are performed by trusted Edge Functions, not the browser.
revoke insert, update, delete on public.payments from anon, authenticated;

-- Useful discovery index/query shape.
-- SELECT * FROM public.marketplace_discovery
-- ORDER BY active_featured DESC, created_at DESC;

-- Daily cleanup at 02:10 UTC. Supabase hosted projects support pg_cron.
select cron.unschedule(jobid)
from cron.job
where jobname = 'trotromall-expire-featured-listings';

select cron.schedule(
  'trotromall-expire-featured-listings',
  '10 2 * * *',
  $$select public.expire_featured_listings();$$
);
