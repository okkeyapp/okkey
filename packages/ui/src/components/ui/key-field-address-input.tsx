import * as React from "react";

import { parseKeyFieldAddressValue, serializeKeyFieldAddressValue, type KeyFieldAddressValue } from "../../lib/key-field-address.js";
import { isKeyFieldAddressInteractionTarget } from "../../lib/key-field-address-interaction.js";
import { getKeyFieldCountries } from "../../lib/key-field-countries.js";
import { cn } from "../../lib/utils.js";
import {
  SearchableSelect,
  SearchableSelectContent,
  SearchableSelectItem,
  SearchableSelectTrigger,
} from "./searchable-select.js";

const addressInputClassName =
  "h-5 w-full min-w-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground";

export type KeyFieldAddressInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  streetInputRef?: React.Ref<HTMLInputElement>;
  className?: string;
  fieldPlaceholders?: Record<AddressFieldKey, string>;
  searchCountriesPlaceholder?: string;
  noCountriesFoundMessage?: string;
  /** BCP 47 locale for Intl.DisplayNames country labels (same source as settings region). */
  countryLocale?: string;
};

type AddressFieldKey = keyof KeyFieldAddressValue;

/** Apartment + house first, then street → city → state → postal; country is the select below. */
const addressFieldOrder: AddressFieldKey[] = [
  "apartment",
  "house",
  "street",
  "city",
  "state",
  "postalCode",
];

const defaultAddressFieldPlaceholders: Record<AddressFieldKey, string> = {
  apartment: "Apartment",
  house: "House / building",
  street: "Street",
  city: "City/Town/Suburb",
  state: "State/Province",
  postalCode: "ZIP/Postal code",
  country: "Country",
};

export function KeyFieldAddressInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  streetInputRef,
  className,
  fieldPlaceholders,
  searchCountriesPlaceholder = "Search countries",
  noCountriesFoundMessage = "No countries found",
  countryLocale = "en",
}: KeyFieldAddressInputProps) {
  const address = React.useMemo(() => parseKeyFieldAddressValue(value), [value]);
  const countries = React.useMemo(() => getKeyFieldCountries(countryLocale), [countryLocale]);
  const addressFieldPlaceholders = fieldPlaceholders ?? defaultAddressFieldPlaceholders;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const houseInputRef = React.useRef<HTMLInputElement>(null);
  const localStreetInputRef = React.useRef<HTMLInputElement>(null);
  const cityInputRef = React.useRef<HTMLInputElement>(null);
  const stateInputRef = React.useRef<HTMLInputElement>(null);
  const postalCodeInputRef = React.useRef<HTMLInputElement>(null);
  const countryTriggerRef = React.useRef<HTMLDivElement>(null);
  const isCountrySelectOpenRef = React.useRef(false);
  const [countrySelectOpen, setCountrySelectOpen] = React.useState(false);
  const isFocusedRef = React.useRef(false);

  const setFocused = React.useCallback(
    (next: boolean) => {
      if (isFocusedRef.current === next) {
        return;
      }

      isFocusedRef.current = next;
      if (next) {
        onFocus?.();
      } else {
        onBlur?.();
      }
    },
    [onBlur, onFocus],
  );

  const syncFocusState = React.useCallback(() => {
    const activeElement = document.activeElement;
    const panel = panelRef.current;
    if (!(activeElement instanceof Element) || !panel) {
      setFocused(false);
      return;
    }

    const isFocused =
      panel.contains(activeElement) ||
      (isCountrySelectOpenRef.current && isKeyFieldAddressInteractionTarget(activeElement));

    setFocused(isFocused);
  }, [setFocused]);

  const handleCountryOpenChange = React.useCallback(
    (open: boolean) => {
      isCountrySelectOpenRef.current = open;
      setCountrySelectOpen(open);
      window.setTimeout(syncFocusState, 0);
    },
    [syncFocusState],
  );

  React.useEffect(() => {
    function handleDocumentFocusIn() {
      if (!isFocusedRef.current && !isCountrySelectOpenRef.current) {
        return;
      }

      syncFocusState();
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!isFocusedRef.current && !isCountrySelectOpenRef.current) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }

      const panel = panelRef.current;
      if (panel?.contains(target)) {
        return;
      }

      if (isCountrySelectOpenRef.current && isKeyFieldAddressInteractionTarget(target)) {
        return;
      }

      window.setTimeout(syncFocusState, 0);
    }

    document.addEventListener("focusin", handleDocumentFocusIn);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);

    return () => {
      document.removeEventListener("focusin", handleDocumentFocusIn);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [syncFocusState]);

  function focusInputRef(inputRef: React.Ref<HTMLInputElement>) {
    if (typeof inputRef === "function") {
      return;
    }

    inputRef?.current?.focus();
  }

  function updateAddressField(field: AddressFieldKey, nextValue: string) {
    onValueChange(
      serializeKeyFieldAddressValue({
        ...address,
        [field]: nextValue,
      }),
    );
  }

  function inputRefForField(field: AddressFieldKey): React.Ref<HTMLInputElement> | undefined {
    switch (field) {
      case "apartment":
        // Parent passes valueInputRef as streetInputRef for edit-focus; apartment is first.
        return streetInputRef;
      case "house":
        return houseInputRef;
      case "street":
        return localStreetInputRef;
      case "city":
        return cityInputRef;
      case "state":
        return stateInputRef;
      case "postalCode":
        return postalCodeInputRef;
      default:
        return undefined;
    }
  }

  function focusAddressField(field: AddressFieldKey) {
    if (field === "apartment") {
      focusInputRef(streetInputRef ?? { current: null });
      return;
    }

    const ref = inputRefForField(field);
    if (ref && typeof ref !== "function") {
      ref.current?.focus();
    }
  }

  function focusCountryField(openDropdown = false) {
    countryTriggerRef.current?.focus();
    if (openDropdown) {
      setCountrySelectOpen(true);
    }
  }

  function focusNextField(currentField: AddressFieldKey) {
    const currentIndex = addressFieldOrder.indexOf(currentField);
    if (currentIndex === -1) {
      return;
    }

    if (currentIndex < addressFieldOrder.length - 1) {
      focusAddressField(addressFieldOrder[currentIndex + 1]!);
      return;
    }

    focusCountryField(true);
  }

  function handleFieldNavigationKey(event: React.KeyboardEvent<HTMLInputElement>, field: AddressFieldKey) {
    if (event.shiftKey) {
      return;
    }

    if (event.key !== "Tab" && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    focusNextField(field);
  }

  return (
    <div
      ref={panelRef}
      data-key-field-address-panel
      className={cn("flex w-full flex-col", className)}
      onFocusCapture={() => syncFocusState()}
      onBlurCapture={() => window.setTimeout(syncFocusState, 0)}
    >
      {addressFieldOrder.map((field) => (
        <input
          key={field}
          ref={inputRefForField(field)}
          value={address[field]}
          placeholder={addressFieldPlaceholders[field]}
          onChange={(event) => updateAddressField(field, event.target.value)}
          onKeyDown={(event) => handleFieldNavigationKey(event, field)}
          className={addressInputClassName}
        />
      ))}
      <SearchableSelect
        value={address.country || undefined}
        onValueChange={(nextCountry) => updateAddressField("country", nextCountry)}
        open={countrySelectOpen}
        onOpenChange={handleCountryOpenChange}
        placeholder={addressFieldPlaceholders.country}
        variant="inline"
        searchPlaceholder={searchCountriesPlaceholder}
        searchEmptyMessage={noCountriesFoundMessage}
        selectedLabel={address.country ? countries.find((country) => country.code === address.country)?.name : undefined}
      >
        <SearchableSelectTrigger
          ref={countryTriggerRef}
          className="h-5 w-full min-w-0 justify-start text-sm font-normal [&>span:last-child]:hidden"
        />
        <SearchableSelectContent align="start" className="w-[min(100vw-2rem,20rem)]" data-key-field-address-popover>
          {countries.map((country) => (
            <SearchableSelectItem
              key={country.code}
              value={country.code}
              label={country.name}
              searchText={`${country.code} ${country.name}`}
            >
              {country.name}
            </SearchableSelectItem>
          ))}
        </SearchableSelectContent>
      </SearchableSelect>
    </div>
  );
}
