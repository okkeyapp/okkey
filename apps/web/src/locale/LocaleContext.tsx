import { formatWebMessage, type WebLocale, type WebMessageValues } from "@okkey/i18n";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { applyLocaleToDocument, readStoredLocale, writeStoredLocale } from "./localeStorage";

type LocaleContextValue = {
  locale: WebLocale;
  setLocale: (locale: WebLocale) => void;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<WebLocale>(() => readStoredLocale());

  useEffect(() => {
    applyLocaleToDocument(locale);
  }, [locale]);

  const setLocale = useCallback((next: WebLocale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const t = useCallback(
    (messageKey: string, values?: WebMessageValues) => formatWebMessage(locale, messageKey, values ?? {}),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx == null) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
