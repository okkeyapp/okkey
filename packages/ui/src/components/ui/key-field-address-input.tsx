import * as React from "react";

import { parseKeyFieldAddressValue, serializeKeyFieldAddressValue, type KeyFieldAddressValue } from "../../lib/key-field-address.js";
import { isKeyFieldAddressInteractionTarget } from "../../lib/key-field-address-interaction.js";
import { keyFieldCountries } from "../../lib/key-field-countries.js";
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
};

type AddressFieldKey = keyof KeyFieldAddressValue;

const addressFieldOrder: AddressFieldKey[] = ["street", "city", "state", "postalCode"];

const defaultAddressFieldPlaceholders: Record<AddressFieldKey, string> = {
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
}: KeyFieldAddressInputProps) {
  const address = React.useMemo(() => parseKeyFieldAddressValue(value), [value]);
  const addressFieldPlaceholders = fieldPlaceholders ?? defaultAddressFieldPlaceholders;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const cityInputRef = React.useRef<HTMLInputElement>(null);
  const stateInputRef = React.useRef<HTMLInputElement>(null);
  const postalCodeInputRef = React.useRef<HTMLInputElement>(null);
  const countryTriggerRef = React.useRef<HTMLDivElement>(null);
  const isCountrySelectOpenRef = React.useRef(false);
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

  function focusAddressField(field: AddressFieldKey) {
    if (field === "street") {
      focusInputRef(streetInputRef ?? { current: null });
      return;
    }

    if (field === "city") {
      cityInputRef.current?.focus();
      return;
    }

    if (field === "state") {
      stateInputRef.current?.focus();
      return;
    }

    postalCodeInputRef.current?.focus();
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

    countryTriggerRef.current?.focus();
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLInputElement>, field: AddressFieldKey) {
    if (event.key !== "Tab" || event.shiftKey) {
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
          ref={field === "street" ? streetInputRef : field === "city" ? cityInputRef : field === "state" ? stateInputRef : postalCodeInputRef}
          value={address[field]}
          placeholder={addressFieldPlaceholders[field]}
          onChange={(event) => updateAddressField(field, event.target.value)}
          onKeyDown={(event) => handleTabKey(event, field)}
          className={addressInputClassName}
        />
      ))}
      <SearchableSelect
        value={address.country || undefined}
        onValueChange={(nextCountry) => updateAddressField("country", nextCountry)}
        onOpenChange={handleCountryOpenChange}
        placeholder={addressFieldPlaceholders.country}
        variant="inline"
        searchPlaceholder={searchCountriesPlaceholder}
        searchEmptyMessage={noCountriesFoundMessage}
        selectedLabel={address.country ? keyFieldCountries.find((country) => country.code === address.country)?.name : undefined}
      >
        <SearchableSelectTrigger
          ref={countryTriggerRef}
          className="h-5 w-full min-w-0 justify-start text-sm font-normal [&>span:last-child]:hidden"
        />
        <SearchableSelectContent align="start" className="w-[min(100vw-2rem,20rem)]" data-key-field-address-popover>
          {keyFieldCountries.map((country) => (
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
