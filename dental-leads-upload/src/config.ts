// Cities searched every Monday. Use "City, State" (or "City, Country") so Google geolocates correctly.
// 10 largest cities in Algeria. 10 x 3 pages = 30 requests, exactly the free-tier cap below.
export const CITIES: string[] = [
  "Algiers, Algeria",
  "Oran, Algeria",
  "Constantine, Algeria",
  "Annaba, Algeria",
  "Blida, Algeria",
  "Batna, Algeria",
  "Setif, Algeria",
  "Djelfa, Algeria",
  "Sidi Bel Abbes, Algeria",
  "Biskra, Algeria",
];

// Search term sent to Google Places for each city.
export const SEARCH_QUERY = "dentist";

// Google returns 20 results per page, max 3 pages (60 results). Each page is one billable request.
export const PAGES_PER_CITY = 3;

// Safety cap: the run refuses to start if CITIES x PAGES_PER_CITY would exceed this.
// Keep this equal to the Places "SearchTextRequest per day" quota set in Google Cloud.
// 30/day x 31 days = 930/month, under the 1,000 free, so the bill can't pass $0.
// e.g. 10 cities x 3 pages, or 30 cities x 1 page.
export const MAX_REQUESTS_PER_RUN = 30;
