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
const PHONE_COLUMN = "E";
const PLACE_ID_COLUMN = "J";
// Place ID's index within a row read from PHONE_COLUMN..PLACE_ID_COLUMN (E=0 ... J=5)
const PLACE_ID_OFFSET = 5;

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

// Digits only, with Algeria's +213 prefix turned into the local leading 0, so "+213 552 17 25 94"
// and "0552 17 25 94" compare equal. Empty when there's no usable number.
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("213")) digits = "0" + digits.slice(3);
  return digits.length >= 8 ? digits : "";
}

// Returns the leads not already in the sheet. A lead is a duplicate if its Google place ID or its
// phone number was seen before: Google often lists one practice twice (e.g. French + Arabic name),
// with different place IDs but the same phone.
export async function filterNewLeads(leads: Lead[]): Promise<Lead[]> {
  const sheets = sheetsClient();
  const spreadsheetId = sheetId();
  await ensureTab(sheets, spreadsheetId);

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!${PHONE_COLUMN}2:${PLACE_ID_COLUMN}`,
  });
  const seenIds = new Set<string>();
  const seenPhones = new Set<string>();
  for (const row of existing.data.values ?? []) {
    const phone = normalizePhone(String(row[0] ?? ""));
    if (phone) seenPhones.add(phone);
    if (row[PLACE_ID_OFFSET]) seenIds.add(String(row[PLACE_ID_OFFSET]));
  }

  // Also dedupes within this batch, since a run can return both listings of the same practice
  const fresh: Lead[] = [];
  for (const lead of leads) {
    const phone = normalizePhone(lead.phone);
    if (seenIds.has(lead.placeId) || (phone && seenPhones.has(phone))) continue;
    seenIds.add(lead.placeId);
    if (phone) seenPhones.add(phone);
    fresh.push(lead);
  }
  return fresh;
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
