import { google } from "googleapis";
import type { Lead } from "./places.js";

const TAB = "Leads";
const HEADERS = [
  "Date Found",
  "Practice Name",
  "City",
  "Address",
  "Phone",
  "Rating",
  "Reviews",
  "Category",
  "Google Maps",
  "Place ID",
  "Status",
];
const PLACE_ID_COLUMN = "J";

function sheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Private keys pasted into env vars usually have literal "\n" sequences
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY not set");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function sheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

// Creates the "Leads" tab and header row on first run.
async function ensureTab(sheets: ReturnType<typeof sheetsClient>, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TAB);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}

// Returns the leads not already in the sheet (deduped by Google place ID).
export async function filterNewLeads(leads: Lead[]): Promise<Lead[]> {
  const sheets = sheetsClient();
  const spreadsheetId = sheetId();
  await ensureTab(sheets, spreadsheetId);

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!${PLACE_ID_COLUMN}2:${PLACE_ID_COLUMN}`,
  });
  const seen = new Set((existing.data.values ?? []).map((row) => String(row[0])));
  return leads.filter((l) => !seen.has(l.placeId));
}

// Appends leads to the sheet as-is. Call filterNewLeads first to avoid duplicates.
export async function appendLeads(fresh: Lead[]): Promise<void> {
  if (fresh.length === 0) return;
  const sheets = sheetsClient();
  const spreadsheetId = sheetId();

  const today = new Date().toISOString().slice(0, 10);
  const rows = fresh.map((l) => [
      today,
      l.name,
      l.city,
      l.address,
      l.phone,
      l.rating ?? "",
      l.reviews ?? "",
      l.category,
      l.mapsUrl,
      l.placeId,
      "New",
    ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}
