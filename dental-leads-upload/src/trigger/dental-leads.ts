import { schedules, task, logger, idempotencyKeys } from "@trigger.dev/sdk";
import { CITIES, MAX_REQUESTS_PER_RUN, PAGES_PER_CITY, SEARCH_QUERY } from "../config.js";
import { findPracticesWithoutWebsite, type Lead } from "../lib/places.js";
import { appendLeads, filterNewLeads } from "../lib/sheets.js";
import { clickUpConfigured, createLeadTask, DELAY_MS } from "../lib/clickup.js";

// Searches one city and returns dental practices that have no website.
export const searchCity = task({
  id: "dental-leads-search-city",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 30_000 },
  run: async (payload: { city: string }) => {
    const leads = await findPracticesWithoutWebsite(SEARCH_QUERY, payload.city, PAGES_PER_CITY);
    logger.info(`Found ${leads.length} practices without a website`, { city: payload.city });
    return leads;
  },
});

// Creates one ClickUp task per lead. Concurrency 1 + a short pause keeps us under ClickUp's 100 req/min.
export const createClickUpTask = task({
  id: "dental-leads-clickup-task",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60_000 },
  run: async (lead: Lead) => {
    await createLeadTask(lead);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    return { created: lead.name };
  },
});

// Every Monday: search each city, dedupe, queue ClickUp tasks, and append new leads to the Google Sheet.
export const weeklyDentalLeads = schedules.task({
  id: "weekly-dental-leads",
  cron: "0 8 * * 1", // Mondays 08:00 UTC
  run: async () => {
    const maxRequests = CITIES.length * PAGES_PER_CITY;
    if (maxRequests > MAX_REQUESTS_PER_RUN) {
      throw new Error(
        `${CITIES.length} cities x ${PAGES_PER_CITY} pages = ${maxRequests} requests, over the ` +
          `free-tier cap of ${MAX_REQUESTS_PER_RUN}. Reduce CITIES or PAGES_PER_CITY in src/config.ts.`
      );
    }

    const results = await searchCity.batchTriggerAndWait(
      CITIES.map((city) => ({ payload: { city } }))
    );

    const leads = new Map<string, Lead>();
    const failedCities: string[] = [];
    results.runs.forEach((run, i) => {
      if (run.ok) {
        for (const lead of run.output) leads.set(lead.placeId, lead);
      } else {
        failedCities.push(CITIES[i]);
      }
    });

    const fresh = await filterNewLeads([...leads.values()]);

    // Queue ClickUp before writing the sheet: if this run dies in between, the retry sees the same
    // fresh leads and the idempotency keys stop duplicates. (Queuing after would lose them.)
    let clickUpQueued = 0;
    if (clickUpConfigured()) {
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500);
        const items = [];
        for (const lead of chunk) {
          const idempotencyKey = await idempotencyKeys.create(`clickup-${lead.placeId}`, { scope: "global" });
          items.push({ payload: lead, options: { idempotencyKey } });
        }
        await createClickUpTask.batchTrigger(items);
        clickUpQueued += chunk.length;
      }
    }

    await appendLeads(fresh);

    const added = fresh.length;
    logger.info("Weekly dental leads complete", { found: leads.size, added, clickUpQueued, failedCities });

    return { citiesSearched: CITIES.length, found: leads.size, added, clickUpQueued, failedCities };
  },
});
