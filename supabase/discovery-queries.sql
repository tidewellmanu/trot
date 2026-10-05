-- Production discovery patterns.
-- The view converts expired featured flags into active_featured=false at read time.

select *
from public.marketplace_discovery
order by active_featured desc, created_at desc
limit 24;

select *
from public.marketplace_discovery
where category = 'Vehicles'
order by active_featured desc, created_at desc
limit 24;

-- Direct query without the view:
select *
from public.listings
where coalesce(status, 'active') = 'active'
order by (is_featured = true and featured_until > now()) desc, created_at desc
limit 24;
