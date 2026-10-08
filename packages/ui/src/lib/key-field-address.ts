import { getKeyFieldCountryName } from "./key-field-countries.js";

export type KeyFieldAddressValue = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export const emptyKeyFieldAddressValue = (): KeyFieldAddressValue => ({
  street: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
});

export function serializeKeyFieldAddressValue(value: KeyFieldAddressValue): string {
  return JSON.stringify(value);
}

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
      street: typeof record.street === "string" ? record.street : "",
      city: typeof record.city === "string" ? record.city : "",
      state: typeof record.state === "string" ? record.state : "",
      postalCode: typeof record.postalCode === "string" ? record.postalCode : "",
      country: typeof record.country === "string" ? record.country : "",
    };
  } catch {
    return emptyKeyFieldAddressValue();
  }
}

export function formatKeyFieldAddressCopyValue(
  value: KeyFieldAddressValue,
  locale = "en",
): string {
  const parts: string[] = [];
  const street = value.street.trim();
  const city = value.city.trim();
  const state = value.state.trim();
  const postalCode = value.postalCode.trim();
  const country = value.country.trim();

  if (street) {
    parts.push(street);
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
