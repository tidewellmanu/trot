-- Fresh production-safe TrotroMall schema
-- Run on a new Supabase project or as a deliberate replacement of the prototype schema.
create extension if not exists pgcrypto;

create table if not exists public.listings(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 3 and 160),
 description text,
 price numeric(14,2) not null check(price>=0),
 category text not null,
 location text not null,
 condition text not null default 'Used',
 seller_phone text,
 status text not null default 'active' check(status in ('active','pending','sold','deleted')),
 images text[] not null default '{}',
 is_featured boolean not null default false,
 featured_until timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists listings_status_created_idx on public.listings(status,created_at desc);
create index if not exists listings_user_created_idx on public.listings(user_id,created_at desc);
create index if not exists listings_featured_idx on public.listings(is_featured desc,created_at desc);

create table if not exists public.listing_images(
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique,
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists listing_images_listing_position_idx on public.listing_images(listing_id,position);

create table if not exists public.messages(
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete cascade,
 sender_id uuid references auth.users(id) on delete set null,
 sender_name text not null,
 sender_email text,
 sender_phone text,
 body text not null check(char_length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists messages_listing_created_idx on public.messages(listing_id,created_at desc);

create table if not exists public.payments(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 listing_id uuid not null references public.listings(id) on delete cascade,
 client_reference text not null unique,
 hubtel_transaction_id text unique,
 amount numeric(14,2) not null check(amount>0),
 currency text not null default 'GHS' check(currency='GHS'),
 payment_status text not null default 'pending' check(payment_status in ('pending','completed','failed')),
 channel text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.admin_users(
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at before update on public.listings for each row execute function public.set_updated_at();
drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists listings_public_read on public.listings;
create policy listings_public_read on public.listings for select to anon,authenticated using(status='active' or (select auth.uid())=user_id);
drop policy if exists listings_owner_insert on public.listings;
create policy listings_owner_insert on public.listings for insert to authenticated with check((select auth.uid())=user_id);
drop policy if exists listings_owner_update on public.listings;
create policy listings_owner_update on public.listings for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists listings_owner_delete on public.listings;
create policy listings_owner_delete on public.listings for delete to authenticated using((select auth.uid())=user_id);

drop policy if exists admin_self_read on public.admin_users;
create policy admin_self_read on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists listings_admin_delete on public.listings;
create policy listings_admin_delete on public.listings for delete to authenticated using(exists(select 1 from public.admin_users a where a.user_id=(select auth.uid())));

drop policy if exists images_public_read on public.listing_images;
create policy images_public_read on public.listing_images for select to anon,authenticated using(true);
drop policy if exists images_owner_insert on public.listing_images;
create policy images_owner_insert on public.listing_images for insert to authenticated with check((select auth.uid())=user_id);
drop policy if exists images_owner_delete on public.listing_images;
create policy images_owner_delete on public.listing_images for delete to authenticated using((select auth.uid())=user_id);

drop policy if exists messages_public_insert on public.messages;
create policy messages_public_insert on public.messages for insert to anon,authenticated with check(true);
drop policy if exists messages_owner_read on public.messages;
create policy messages_owner_read on public.messages for select to authenticated using(exists(select 1 from public.listings l where l.id=listing_id and l.user_id=(select auth.uid())));

drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read on public.payments for select to authenticated using((select auth.uid())=user_id);
revoke insert,update,delete on public.payments from anon,authenticated;

create or replace function public.complete_feature_payment(p_client_reference text,p_hubtel_transaction_id text,p_channel text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; l public.listings%rowtype; u timestamptz;
begin
 if p_amount<=0 then raise exception 'Invalid payment amount'; end if;
 select * into p from public.payments where client_reference=p_client_reference for update;
 if not found then raise exception 'Payment reference not found'; end if;
 select * into l from public.listings where id=p.listing_id for update;
 if not found then raise exception 'Listing not found'; end if;
 if p.payment_status='completed' then return jsonb_build_object('ok',true,'already_completed',true,'listing_id',p.listing_id); end if;
 u=greatest(coalesce(l.featured_until,now()),now())+interval '7 days';
 update public.payments set payment_status='completed',hubtel_transaction_id=coalesce(p_hubtel_transaction_id,hubtel_transaction_id),channel=coalesce(nullif(p_channel,''),channel) where id=p.id;
 update public.listings set is_featured=true,featured_until=u where id=p.listing_id;
 return jsonb_build_object('ok',true,'listing_id',p.listing_id,'featured_until',u);
end $$;
revoke all on function public.complete_feature_payment(text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.complete_feature_payment(text,text,text,numeric) to service_role;

create or replace function public.expire_featured_listings() returns integer
language plpgsql security definer set search_path=public as $$
declare n integer; begin update public.listings set is_featured=false where is_featured and featured_until is not null and featured_until<now(); get diagnostics n=row_count; return n; end $$;
revoke all on function public.expire_featured_listings() from public,anon,authenticated;
grant execute on function public.expire_featured_listings() to service_role;

create or replace view public.marketplace_discovery with(security_invoker=true) as
select *, (is_featured and featured_until is not null and featured_until>now()) as active_featured
from public.listings where status='active';

insert into storage.buckets(id,name,public) values('listing-photos','listing-photos',true) on conflict(id) do update set public=true;
drop policy if exists listing_photos_public_read on storage.objects;
create policy listing_photos_public_read on storage.objects for select to anon,authenticated using(bucket_id='listing-photos');
drop policy if exists listing_photos_owner_insert on storage.objects;
drop policy if exists listing_photos_owner_upload on storage.objects;
create policy listing_photos_owner_insert on storage.objects for insert to authenticated with check(bucket_id='listing-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists listing_photos_owner_update on storage.objects;
create policy listing_photos_owner_update on storage.objects for update to authenticated using(bucket_id='listing-photos' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='listing-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists listing_photos_owner_delete on storage.objects;
create policy listing_photos_owner_delete on storage.objects for delete to authenticated using(bucket_id='listing-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
