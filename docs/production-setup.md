# TrotroMall production setup

## 1. Supabase

Run the migration in `supabase/migrations/202609240001_featured_listings_payments.sql` in the Supabase SQL editor.

The migration adds:

- `listings.is_featured`
- `listings.featured_until`
- `payments` immutable-style bookkeeping fields
- payment indexes
- an atomic `complete_feature_payment(...)` function
- `expire_featured_listings()` cleanup
- a `marketplace_discovery` view
- a daily `pg_cron` cleanup job

Supabase documents `pg_cron` as the built-in recurring scheduler and supports invoking Edge Functions with `pg_net` when network jobs are required. The migration uses a database function for the featured cleanup because it is cheaper and does not depend on an HTTP round-trip.

## 2. Secrets

Never put Hubtel credentials in HTML, JavaScript, Git, or Vercel client-side environment variables.

Set these as Supabase Edge Function secrets:

```text
HUBTEL_ACCOUNT_NUMBER=...
HUBTEL_API_ID=...
HUBTEL_API_KEY=...
HUBTEL_CALLBACK_TOKEN=long-random-secret
HUBTEL_CHECKOUT_ENDPOINT=https://payproxyapi.hubtel.com/items/initiate
HUBTEL_API_BASE_URL=https://payproxyapi.hubtel.com
SITE_URL=https://trotromall.com
ALLOWED_ORIGIN=https://trotromall.com
```

For current Hubtel API migrations, the checkout endpoint is deliberately configurable. The current public Hubtel documentation/search material documents redirect checkout through `payproxyapi.hubtel.com/items/initiate`; if your Hubtel merchant account provides a different v2 endpoint, set `HUBTEL_CHECKOUT_ENDPOINT` to that official endpoint without changing application code.

## 3. Supabase Edge Functions

Deploy:

```bash
supabase functions deploy initiate-hubtel-payment
supabase functions deploy hubtel-webhook
supabase functions deploy expire-featured
```

The browser calls only `initiate-hubtel-payment`. Hubtel calls `hubtel-webhook`. The browser never receives or sends the Hubtel API ID/key.

## 4. Payment security

The webhook can require a private random callback token in addition to Hubtel status verification. The token should be long, random and stored only as a Supabase Edge Function secret. The webhook treats Hubtel's POST as a trigger, not final proof of payment. It:

1. validates the payment reference exists;
2. requires the callback to indicate completion and the expected GH₵50 amount;
3. calls Hubtel's transaction-status endpoint server-to-server using the private credentials;
4. verifies the client reference and amount;
5. calls the atomic PostgreSQL RPC;
6. the RPC locks the payment/listing rows and makes the payment and featured activation update in one transaction;
7. repeat callbacks are idempotent.

This is preferable to trusting a client redirect or an unverified browser request.

## 5. Browser configuration

Edit `assets/js/config.js` with only:

- Supabase project URL
- Supabase publishable key

Never put the Supabase secret/service-role key there.

## 6. Featured listing UX

Open:

```text
advertise.html?listing_id=<LISTING_UUID>
```

The page presents:

- GH₵50 price
- 7-day duration
- MTN MoMo, Telecel Cash and AT Money as prominent choices/anchors
- card checkout as an alternative
- the exact Mobile Money prompt copy requested by the business
- security guidance

On successful Hubtel redirect, `payment-result.html` checks the ledger and explains whether activation is complete, failed or still processing.

## 7. SEO / AI crawler readiness

The project includes:

- unique page titles and descriptions
- canonical URLs
- Open Graph/Twitter metadata
- WebSite + SearchAction structured data
- dynamic Product structured data on listing pages
- `robots.txt`
- `sitemap.xml`
- `llms.txt` for AI/answer-engine discovery
- `security.txt`
- semantic headings and accessible labels
- lazy-loaded listing images
- mobile-first navigation and touch targets
- internal category links

No SEO implementation can guarantee a particular Google ranking. Ranking depends on content quality, crawlability, performance, backlinks, search demand, indexing and many external factors.

## Admin login protection

The admin area now uses Supabase Auth for the password and a server-side `public.admin_users` allowlist for authorization. Do not put an admin password in HTML, JavaScript, localStorage, or Git.

1. Apply `supabase/migrations/202609240002_admin_access.sql`.
2. Create the administrator account with Supabase Auth using email/password.
3. Copy that Auth user's UUID into `public.admin_users`, for example:
   `insert into public.admin_users (user_id) select id from auth.users where email = 'YOUR-ADMIN-EMAIL@example.com' on conflict (user_id) do nothing;`
4. Open `/admin/login.html` and sign in.
5. Admin pages redirect unauthorised users to the admin login.

The static frontend is only the UI; Supabase Auth and the server-side allowlist are what enforce access. Keep Supabase credentials configured and never expose a service-role key in the browser.
