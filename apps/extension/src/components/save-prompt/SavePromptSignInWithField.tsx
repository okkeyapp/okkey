import type { WebLocale } from "@okkey/i18n";
import { formatWebMessage } from "@okkey/i18n";
import {
  SearchableSelect,
  SearchableSelectContent,
  SearchableSelectItem,
  SearchableSelectTrigger,
  cn,
} from "@okkey/ui";
import { ItemRecordFavicon, NO_LINKED_ACCOUNT_VALUE } from "@okkey/vault-ui";
import { useMemo } from "react";

import type { AutofillLoginLinkTarget } from "../../lib/autofillMessages";

function t(locale: WebLocale, key: string, fallback: string): string {
  try {
    return formatWebMessage(locale, key);
  } catch {
    return fallback;
  }
}

type SavePromptSignInWithFieldProps = {
  locale: WebLocale;
  value: string;
  onValueChange: (next: string) => void;
  targets: AutofillLoginLinkTarget[];
  disabled?: boolean;
};

function TargetLabel({ target }: { target: AutofillLoginLinkTarget }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <ItemRecordFavicon
        categoryId="login"
        title={target.title}
        previewImageSrc={target.iconUrl}
        size={20}
        alt=""
      />
      <span className="min-w-0 flex-1 truncate leading-5">{target.title}</span>
    </span>
  );
}

export function SavePromptSignInWithField({
  locale,
  value,
  onValueChange,
  targets,
  disabled,
}: SavePromptSignInWithFieldProps) {
  const label = t(locale, "extension.autofill.signInWith.label", "Sign in with");
  const none = t(locale, "extension.autofill.signInWith.none", "No linked account");
  const search = t(locale, "web.newItemPopup.signInWith.search", "Search by title");
  const searchEmpty = t(
    locale,
    "web.newItemPopup.signInWith.searchEmpty",
    "No login items found",
  );

  const selected = useMemo(
    () => targets.find((target) => target.itemId === value) ?? null,
    [targets, value],
  );

  const selectedLabel = selected ? <TargetLabel target={selected} /> : none;

  return (
    <div className="flex flex-col gap-2 py-1">
      <label htmlFor="extension-sign-in-with" className="text-sm font-medium text-foreground">
        {label}
      </label>
      <SearchableSelect
        value={value || NO_LINKED_ACCOUNT_VALUE}
        onValueChange={onValueChange}
        disabled={disabled}
        placeholder={none}
        searchPlaceholder={search}
        searchEmptyMessage={searchEmpty}
        selectedLabel={selectedLabel}
      >
        <SearchableSelectTrigger
          id="extension-sign-in-with"
          className={cn("h-10 w-full min-w-0")}
          aria-label={label}
        />
        <SearchableSelectContent align="start">
          <SearchableSelectItem
            value={NO_LINKED_ACCOUNT_VALUE}
            searchText={none}
            label={none}
          >
            {none}
          </SearchableSelectItem>
          {targets.map((target) => (
            <SearchableSelectItem
              key={target.itemId}
              value={target.itemId}
              searchText={target.title}
              label={<TargetLabel target={target} />}
            >
              <TargetLabel target={target} />
            </SearchableSelectItem>
          ))}
        </SearchableSelectContent>
      </SearchableSelect>
    </div>
  );
}
