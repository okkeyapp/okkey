import type { WebMessageValues } from "@okkey/i18n";
import {
  SearchableSelect,
  SearchableSelectContent,
  SearchableSelectItem,
  SearchableSelectTrigger,
  cn,
} from "@okkey/ui";
import { NO_LINKED_ACCOUNT_VALUE } from "@okkey/vault-ui";
import { useMemo } from "react";

import { useClientWebsiteIconSrc } from "../../items/faviconMode";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import ItemRecordFavicon from "./ItemRecordFavicon";

export type SignInWithOption = {
  id: string;
  title: string;
  urls: string[];
  faviconId?: string;
};

type SignInWithFieldProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  value: string;
  onValueChange: (next: string) => void;
  /** Exclude this item id from the picker (self). */
  excludeItemId?: string;
  disabled?: boolean;
};

function SignInWithOptionLabel({ option }: { option: SignInWithOption }) {
  const clientIconSrc = useClientWebsiteIconSrc(option.urls, !option.faviconId);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <ItemRecordFavicon
        categoryId="login"
        title={option.title}
        faviconId={option.faviconId}
        previewImageSrc={clientIconSrc}
        size={20}
        alt=""
      />
      <span className="min-w-0 flex-1 truncate leading-5">{option.title}</span>
    </span>
  );
}

export default function SignInWithField({
  t,
  value,
  onValueChange,
  excludeItemId,
  disabled,
}: SignInWithFieldProps) {
  const { records } = useWorkspaceItems();

  const options = useMemo((): SignInWithOption[] => {
    return (records ?? [])
      .filter(
        (record) =>
          record.categoryId === "login" &&
          !record.deleted &&
          (!excludeItemId || record.id !== excludeItemId),
      )
      .map((record) => ({
        id: record.id,
        title: record.title,
        urls: record.urls,
        faviconId: record.faviconId,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }, [excludeItemId, records]);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  const selectedLabel = selectedOption ? (
    <SignInWithOptionLabel option={selectedOption} />
  ) : (
    t("web.newItemPopup.signInWith.none")
  );

  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor="sign-in-with-select" className="shrink-0 text-sm font-medium text-foreground">
        {t("web.newItemPopup.signInWith.label")}
      </label>
      <SearchableSelect
        value={value || NO_LINKED_ACCOUNT_VALUE}
        onValueChange={onValueChange}
        disabled={disabled}
        placeholder={t("web.newItemPopup.signInWith.none")}
        searchPlaceholder={t("web.newItemPopup.signInWith.search")}
        searchEmptyMessage={t("web.newItemPopup.signInWith.searchEmpty")}
        selectedLabel={selectedLabel}
      >
        <SearchableSelectTrigger
          id="sign-in-with-select"
          className={cn("h-10 w-full min-w-0 sm:flex-1")}
          aria-label={t("web.newItemPopup.signInWith.label")}
        />
        <SearchableSelectContent align="start">
          <SearchableSelectItem
            value={NO_LINKED_ACCOUNT_VALUE}
            searchText={t("web.newItemPopup.signInWith.none")}
            label={t("web.newItemPopup.signInWith.none")}
          >
            {t("web.newItemPopup.signInWith.none")}
          </SearchableSelectItem>
          {options.map((option) => (
            <SearchableSelectItem
              key={option.id}
              value={option.id}
              searchText={option.title}
              label={<SignInWithOptionLabel option={option} />}
            >
              <SignInWithOptionLabel option={option} />
            </SearchableSelectItem>
          ))}
        </SearchableSelectContent>
      </SearchableSelect>
    </div>
  );
}
