// A small country list for the coach profile (Nov 2026).
//
// Deliberately NOT the full ISO-3166 set: a 250-entry dropdown is worse than a short one of the
// places Repsy's coaches are, plus a catch-all. Each is ISO alpha-2 so it matches the server. The
// list only needs to grow when a real coach is somewhere not here.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
];

export const countryName = (code: string | null | undefined) =>
  COUNTRIES.find((c) => c.code === code)?.name ?? "";
