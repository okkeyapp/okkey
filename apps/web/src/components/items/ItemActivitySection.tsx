import type { WebMessageValues } from "@okkey/i18n";
import { ItemActivitySection as SharedItemActivitySection, type ItemActivityEntry } from "@okkey/vault-ui";

import { useLocale } from "../../locale/LocaleContext";

type ItemActivitySectionProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  entries: readonly ItemActivityEntry[];
};

/** Web wrapper — same component as extension; injects locale from LocaleContext. */
export default function ItemActivitySection({ t, entries }: ItemActivitySectionProps) {
  const { locale } = useLocale();
  return <SharedItemActivitySection t={t} locale={locale} entries={entries} />;
}
