export type Lead = {
  placeId: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  rating: number | null;
  reviews: number | null;
  category: string;
  mapsUrl: string;
};

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text: string };
  types?: string[];
  googleMapsUri?: string;
  businessStatus?: string;
};

// The field mask decides billing. These fields fall under Text Search Enterprise (1,000 free requests/month).
// Don't add Atmosphere fields (reviews, editorialSummary, etc.): that moves requests to a pricier SKU.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

// Searches Google Places (Text Search, New) and returns only open practices with no website listed.
// Each page is one billable request; Google caps pagination at 3 pages (60 results).
export async function findPracticesWithoutWebsite(
  query: string,
  city: string,
  pages: number
): Promise<Lead[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const leads = new Map<string, Lead>();
  let pageToken: string | undefined;

  for (let page = 0; page < Math.min(pages, 3); page++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: `${query} in ${city}`, pageSize: 20, pageToken }),
    });
    if (!res.ok) {
      throw new Error(`Places API ${res.status} for "${city}" page ${page}: ${await res.text()}`);
    }

    const data = (await res.json()) as { places?: Place[]; nextPageToken?: string };
    for (const p of data.places ?? []) {
      if (p.websiteUri || !p.displayName?.text) continue;
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      if (!isDental(p)) continue;
      leads.set(p.id, {
        placeId: p.id,
        name: p.displayName.text,
        city,
        address: p.formattedAddress ?? "",
        phone: p.nationalPhoneNumber ?? "",
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        category: p.primaryTypeDisplayName?.text ?? "",
        mapsUrl: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return [...leads.values()];
}

// Text search mixes in labs, suppliers, etc. Keep anything that reads as a dental practice.
function isDental(p: Place): boolean {
  const text = [p.primaryTypeDisplayName?.text, ...(p.types ?? []), p.displayName?.text]
    .join(" ")
    .toLowerCase();
  return /dent|orthodont|endodont|periodont|oral surg|prosthodont/.test(text);
}
