import type { Lead } from "./places.js";

// ClickUp's free plan allows 100 requests/minute per token; ~650ms apart keeps us under it.
export const DELAY_MS = 650;

export function clickUpConfigured(): boolean {
  return Boolean(process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_LIST_ID);
}

// Creates one ClickUp task for a lead. Throws on failure so the caller can retry.
export async function createLeadTask(lead: Lead): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID?.trim();
  if (!token || !listId) throw new Error("CLICKUP_API_TOKEN / CLICKUP_LIST_ID not set");

  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: lead.name,
      // Details go in the description rather than custom fields, which are capped on the free plan
      markdown_description: [
        `**Phone:** ${lead.phone || "n/a"}`,
        `**City:** ${lead.city}`,
        `**Address:** ${lead.address || "n/a"}`,
        `**Rating:** ${lead.rating ?? "n/a"} (${lead.reviews ?? 0} reviews)`,
        `**Category:** ${lead.category || "n/a"}`,
        `**Google Maps:** ${lead.mapsUrl}`,
        "",
        "No website listed on Google Maps.",
      ].join("\n"),
      tags: ["dental-lead", lead.city.split(",")[0].toLowerCase()],
    }),
  });

  if (!res.ok) {
    throw new Error(`ClickUp ${res.status} for "${lead.name}": ${(await res.text()).slice(0, 200)}`);
  }
}

// Sequential bulk create for one-off scripts (the scheduled job uses one Trigger.dev run per lead instead).
export async function createLeadTasks(leads: Lead[]): Promise<{ created: number; failed: string[] }> {
  let created = 0;
  const failed: string[] = [];

  for (const lead of leads) {
    try {
      await createLeadTask(lead);
      created++;
    } catch (err) {
      failed.push((err as Error).message);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return { created, failed };
}
