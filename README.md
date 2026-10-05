# TrotroMall.com — Ghana marketplace

English, mobile-first classifieds marketplace frontend with a Sprzedajemy-style information architecture, TrotroMall branding, CMS/admin area and a production-oriented Supabase + Hubtel featured-listing payment architecture.

## Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- No React / Next.js / Nuxt / npm required for the static frontend
- Responsive layouts for desktop, tablet and small Ghanaian mobile screens
- Mobile bottom navigation
- Sticky mobile search
- Lazy-loaded listing images
- Accessible labels/focus states
- Deal of the day
- Featured/priority listing sorting
- Advertisement slider
- Promotion slider
- Category directory
- Search/filter pages
- Listing detail/gallery
- Favourites
- Add-listing flow
- Business pages
- Help, safety, privacy and terms pages
- LocalStorage demo data layer
- Optional Supabase Auth browser integration
- TrotroMall Assistant chatbot UI

## SEO / AI discovery

- Page-specific title and description metadata
- Canonical URLs
- Open Graph / Twitter metadata
- WebSite + SearchAction JSON-LD
- Product JSON-LD on listing detail pages
- `robots.txt`
- `sitemap.xml`
- `llms.txt` for AI/answer-engine discovery
- `security.txt`
- Semantic headings and internal category links

SEO foundations improve crawlability and discoverability but cannot guarantee a particular search ranking.

## Admin / CMS

Open `admin/index.html`.

Included areas:

- Dashboard
- Homepage & CMS
- Listings
- Categories
- Users & businesses
- Messages
- Reports & moderation
- Advertising
- Payments & featured listings
- Pages & content
- Site settings

The supplied HTML-only admin is a prototype UI. For production, enforce administrator roles with Supabase Auth/RLS/Edge Functions. Never rely on browser localStorage for administrator security.

## Featured listing monetisation

Business rule:

- Price: **GH₵50.00**
- Duration: **7 days**
- Currency: **GHS**
- Priority: `active_featured DESC, created_at DESC`
- Expired featured records are never treated as active in the discovery view.

Frontend page:

`advertise.html?listing_id=<LISTING_ID>`

Payment return page:

`payment-result.html`

## Supabase production backend

`supabase/migrations/202609240001_featured_listings_payments.sql` contains:

- `listings.is_featured`
- `listings.featured_until`
- `payments` ledger
- unique client references
- Hubtel transaction ID tracking
- payment status constraints
- indexes
- atomic `complete_feature_payment(...)` RPC
- `expire_featured_listings()` cleanup function
- `marketplace_discovery` view
- daily pg_cron cleanup
- payment RLS

Edge Functions:

- `supabase/functions/initiate-hubtel-payment`
- `supabase/functions/hubtel-webhook`
- `supabase/functions/expire-featured`

The webhook does not trust a browser redirect. It can require a private callback token and then performs a server-to-server Hubtel transaction-status verification before the atomic PostgreSQL completion function activates the listing.

## Hubtel credentials

Never expose these in frontend code:

- `HUBTEL_ACCOUNT_NUMBER`
- `HUBTEL_API_ID`
- `HUBTEL_API_KEY`
- `HUBTEL_CALLBACK_TOKEN`

Set them as Supabase Edge Function secrets. See `docs/production-setup.md` and `.env.example`.

The Hubtel checkout endpoint is configurable through `HUBTEL_CHECKOUT_ENDPOINT` because Hubtel has been migrating/versioning API hosts. The project defaults to the currently documented redirect checkout endpoint and lets you set the exact endpoint supplied by your Hubtel merchant account without changing application code.

## Supabase browser configuration

Edit `assets/js/config.js` with only:

- `SUPABASE_URL`
- Supabase publishable key

Never place a Supabase secret/service-role key in this file.

## Important production note

The static frontend is deliberately dependency-free. Production deployment should connect the same UI to Supabase Auth, PostgreSQL, Storage and Edge Functions. The payment implementation is ready for that architecture but requires your real Hubtel merchant credentials and your actual Supabase project before live transactions can occur.
