# Weekly Dental Leads

## Objective
Every Monday, find dental practices with **no website** in the target cities, so they can be pitched website builds. New leads are appended to a Google Sheet, deduped against every previous week. Everything runs on free tiers.

## How it runs
- Trigger.dev scheduled task `weekly-dental-leads` (`src/trigger/dental-leads.ts`), cron `0 8 * * 1` (Mondays 08:00 UTC).
- It fans out one `dental-leads-search-city` run per city (in parallel, retried up to 3x each), then writes to the sheet once.
- Search: Google Places API (New) Text Search (`src/lib/places.ts`). Sheet writes: `src/lib/sheets.ts`.

## Inputs
- Cities, search term, pages per city, and the per-run request cap: `src/config.ts`.
- Env vars (local `.env` for `npm run dev`; Trigger.dev dashboard → Environment Variables for production):
  - `GOOGLE_PLACES_API_KEY`
  - `GOOGLE_SHEET_ID` — the long ID in the sheet URL
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` — from a service account JSON key. Share the sheet with the service account email as **Editor**.
  - `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`

## Google Cloud setup (one time)
1. Create a project at console.cloud.google.com and link a billing account. Google requires one for Places, even on the free tier.
2. Enable **Places API (New)** and **Google Sheets API**.
3. Credentials → Create API key. Restrict it to "Places API (New)". This is `GOOGLE_PLACES_API_KEY`.
4. **Hard cap so the bill can never pass $0:** APIs & Services → Places API (New) → Quotas → set "SearchTextRequest per day" to **30**. That's at most ~900/month, under the 1,000 free.
5. Optional: Billing → Budgets & alerts → a $1 budget with email alerts, as a backup warning.
6. IAM → Service Accounts → create one → Keys → Add key (JSON). Copy `client_email` and `private_key` into the env vars.

## Output
Google Sheet tab `Leads` (created automatically on first run):
Date Found | Practice Name | City | Address | Phone | Rating | Reviews | Category | Google Maps | Place ID | Status

- A lead counts as a duplicate if its **Google Place ID (column J) or phone number (column E)** is already in the sheet, or appears earlier in the same run. Don't delete or reorder those columns.
- Why phone too: Google often lists one practice twice, e.g. a French and an Arabic name or an old and a new name, with different Place IDs but the same phone. Place ID alone let 15 such pairs through on the first run (2026-10-30). Phones are compared as digits only, with `+213` turned into a leading `0`. Leads with no phone fall back to Place ID only.
- `Status` starts as `New`. Edit it freely (Contacted, Won, etc.); the automation never overwrites existing rows.

## ClickUp (pipeline)
- After the sheet write, each **new** lead (only rows just added to the sheet) becomes a task in the ClickUp list `CLICKUP_LIST_ID`, tagged `dental-lead` + city (`src/lib/clickup.ts`).
- Env: `CLICKUP_API_TOKEN` (ClickUp → avatar → Settings → Apps → API Token, starts `pk_`), `CLICKUP_LIST_ID` (open the list; it's the number after `/li/` in the URL). If either is empty, the ClickUp step is skipped and the sheet still works.
- Free plan: API included, 100 requests/min, so tasks are created ~650ms apart. Details go in the task description, not custom fields, which are usage-capped on Free.
- If a task fails, the lead is still in the sheet. Failures are listed under `clickUp.failed` in the run output; add those by hand.

## Cost / free tier
- Since March 2025 Google gives each SKU its own free monthly allowance instead of a $200 credit. The fields we request (website, phone, rating) bill as **Text Search Enterprise: 1,000 free requests/month**, and $35 per 1,000 after that.
- **The field mask in `places.ts` decides the SKU.** Adding Atmosphere fields (reviews, editorialSummary, etc.) moves requests to a pricier SKU. Check Google's "Place Data Fields (New)" page before you add any field.
- Requests per run = cities × `PAGES_PER_CITY` (max 3 pages, 20 results each). The run refuses to start if that's over `MAX_REQUESTS_PER_RUN` (30).
- Google quotas are per day, not per month. A daily quota of 30 is the setting that **guarantees** $0: 30 × 31 = 930 < 1,000. So keep cities × pages ≤ 30, e.g. 10 cities × 3 pages or 30 cities × 1 page.
- To cover more cities, raise both the daily quota and `MAX_REQUESTS_PER_RUN` (e.g. to 200 = 1,000 / 5 Mondays). That stays free only if you don't also make many manual test runs in the same month. Set the $1 budget alert if you do this.

## Edge cases / known behaviour
- "No website" means Google Maps lists no website. Some of these practices have a Facebook page or a site Google doesn't know about, so check before you pitch.
- Closed practices (`businessStatus` not OPERATIONAL) are skipped.
- Results are filtered to dental-sounding types/names to drop labs and suppliers.
- If a city fails after its retries (e.g. the daily quota was hit), the run still writes leads from the other cities and lists the failed ones in `failedCities` in the run output.

## Deploying
- One-time: `npx trigger.dev login` (opens a browser approval link).
- `npx trigger.dev deploy --env-file .env`. The `syncEnvVars` extension in `trigger.config.ts` copies the 4 Google vars from `.env` into the prod environment, so you don't set them in the dashboard. Pass `--env-file`, or the sync finds nothing.
- `@trigger.dev/sdk`, `@trigger.dev/build` and `trigger.dev` must be pinned to the **exact** same version as the CLI (currently 4.8.2), or deploy aborts with "packages don't match the CLI version". When upgrading, bump all three together.
- Quick check of the Google side without Trigger.dev: `node --env-file=.env .tmp/smoke-test.ts` (1 Places request + sheet write).

## Testing
`npm run dev`, then trigger `weekly-dental-leads` from the Trigger.dev dashboard's Test page. To keep test runs cheap, cut `CITIES` to one city and set `PAGES_PER_CITY` to 1.
