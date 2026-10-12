import { getKeyFieldCountryName } from "./key-field-countries.js";

export type KeyFieldAddressValue = {
  apartment: string;
  house: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export const emptyKeyFieldAddressValue = (): KeyFieldAddressValue => ({
  apartment: "",
  house: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
});

function readAddressPart(
  record: Partial<Record<keyof KeyFieldAddressValue, unknown>>,
  key: keyof KeyFieldAddressValue,
): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

/**
 * Strip trailing RU oblast suffixes from a region value for one-line view formatting only.
 * Edit/input field must keep the raw value — do not use this on parse/serialize/onChange.
 * `область` is matched before `обл` so we do not leave a dangling `асть`.
 */
export function normalizeKeyFieldAddressState(state: string): string {
  return state
    .replace(/\s*(?:область|обл\.?)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function serializeKeyFieldAddressValue(value: KeyFieldAddressValue): string {
  return JSON.stringify(value);
}

/**
 * Parse stored address JSON. Missing `house` / `apartment` (legacy) become "".
 * Non-JSON raw returns empty structured value (compatibility with older plain text).
 * Region/state is kept as stored (no oblast-suffix strip — that is view-only).
 */
export function parseKeyFieldAddressValue(value: string): KeyFieldAddressValue {
  const trimmed = value.trim();
  if (!trimmed) {
    return emptyKeyFieldAddressValue();
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return emptyKeyFieldAddressValue();
    }

    const record = parsed as Partial<Record<keyof KeyFieldAddressValue, unknown>>;
    return {
      apartment: readAddressPart(record, "apartment"),
      house: readAddressPart(record, "house"),
      street: readAddressPart(record, "street"),
      city: readAddressPart(record, "city"),
      state: readAddressPart(record, "state"),
      postalCode: readAddressPart(record, "postalCode"),
      country: readAddressPart(record, "country"),
    };
  } catch {
    return emptyKeyFieldAddressValue();
  }
}

function isRuLocale(locale: string): boolean {
  return locale.trim().toLowerCase().startsWith("ru");
}

/** Non-oblast RU region type markers — do not append `обл.` for these. */
function hasRuNonOblastRegionMarker(value: string): boolean {
  // Avoid `\b` — it does not treat Cyrillic as word characters in JS.
  return /(?:^|\s)(?:край|респ\.?|республика|округ|ао)(?:\s|$)/i.test(value) || /респ\./i.test(value);
}

function formatRuState(state: string): string {
  const cleaned = normalizeKeyFieldAddressState(state)
    .replace(/республика/gi, "респ.")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  if (hasRuNonOblastRegionMarker(cleaned)) {
    return cleaned;
  }
  return `${cleaned} обл.`;
}

function formatRuCity(city: string): string {
  const trimmed = city.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(г\.|город)\b/i.test(trimmed)) {
    return trimmed.replace(/^город\b/i, "г.");
  }
  return `г. ${trimmed}`;
}

function formatRuStreet(street: string): string {
  const trimmed = street.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(ул\.|улица|пр\.|просп\.|проспект|пер\.|переулок|бул\.|бульвар|ш\.|шоссе|наб\.|набережная)\b/i.test(trimmed)) {
    return trimmed.replace(/^улица\b/i, "ул.");
  }
  return `ул. ${trimmed}`;
}

function formatRuHouse(house: string): string {
  const trimmed = house.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(д\.|дом)\b/i.test(trimmed)) {
    return trimmed.replace(/^дом\b/i, "д.");
  }
  return `д. ${trimmed}`;
}

function formatRuApartment(apartment: string): string {
  const trimmed = apartment.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(кв\.|квартира|офис|оф\.)\b/i.test(trimmed)) {
    return trimmed.replace(/^квартира\b/i, "кв.");
  }
  return `кв. ${trimmed}`;
}

function formatRuAddressLine(value: KeyFieldAddressValue, locale: string): string {
  const parts: string[] = [];
  const postalCode = value.postalCode.trim();
  const country = value.country.trim();
  const state = formatRuState(value.state);
  const city = formatRuCity(value.city);
  const street = formatRuStreet(value.street);
  const house = formatRuHouse(value.house);
  const apartment = formatRuApartment(value.apartment);

  if (postalCode) {
    parts.push(postalCode);
  }
  if (country) {
    parts.push(getKeyFieldCountryName(country, locale));
  }
  if (state) {
    parts.push(state);
  }
  if (city) {
    parts.push(city);
  }
  if (street) {
    parts.push(street);
  }
  if (house) {
    parts.push(house);
  }
  if (apartment) {
    parts.push(apartment);
  }

  return parts.join(", ");
}

function formatEnAddressLine(value: KeyFieldAddressValue, locale: string): string {
  const parts: string[] = [];
  const apartment = value.apartment.trim();
  const house = value.house.trim();
  const street = value.street.trim();
  const city = value.city.trim();
  const state = value.state.trim();
  const postalCode = value.postalCode.trim();
  const country = value.country.trim();

  if (apartment) {
    parts.push(/^apt\b/i.test(apartment) ? apartment : `Apt ${apartment}`);
  }

  const streetLine = [house, street].filter(Boolean).join(" ");
  if (streetLine) {
    parts.push(streetLine);
  }
  if (city) {
    parts.push(city);
  }
  if (state) {
    parts.push(state);
  }
  if (postalCode) {
    parts.push(postalCode);
  }
  if (country) {
    parts.push(getKeyFieldCountryName(country, locale));
  }

  return parts.join(", ");
}

/** One-line address for copy / list / detail / single-field autofill. Empty parts omitted. */
export function formatKeyFieldAddressCopyValue(
  value: KeyFieldAddressValue,
  locale = "en",
): string {
  if (isRuLocale(locale)) {
    return formatRuAddressLine(value, locale);
  }
  return formatEnAddressLine(value, locale);
}

export function buildKeyFieldAddressMapsUrl(
  value: KeyFieldAddressValue,
  locale = "en",
): string {
  const query = formatKeyFieldAddressCopyValue(value, locale);
  if (!query) {
    return "https://www.google.com/maps";
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
