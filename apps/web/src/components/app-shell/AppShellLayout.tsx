import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale } from "@okkey/i18n";
import {
  AuthShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@okkey/ui";
import type { ReactNode } from "react";

import { useLocale } from "../../locale/LocaleContext";

export type AppShellLayoutProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Logo mark above the title */
  logo?: ReactNode;
  /** Absolute top-left chrome (e.g. back link on legal pages). */
  topLeft?: ReactNode;
  /** Footer line; default uses i18n `web.shell.copyright` */
  copyright?: string;
  /** Max width for header + main column (e.g. wide row of cards). */
  contentClassName?: string;
  /** Horizontal padding around the content column (outside max-width). Default: px-10. */
  frameClassName?: string;
  /** Extra classes for the title/description header. */
  headerClassName?: string;
  /** Extra classes for the main slot wrapper. */
  childrenClassName?: string;
};

export default function AppShellLayout({
  title,
  description,
  children,
  logo,
  topLeft,
  copyright,
  contentClassName,
  frameClassName,
  headerClassName,
  childrenClassName,
}: AppShellLayoutProps) {
  const { locale, setLocale, t } = useLocale();

  const resolvedCopyright =
    copyright ?? t("web.shell.copyright", { year: new Date().getFullYear() });

  return (
    <AuthShell
      title={title}
      description={description}
      logo={logo}
      topLeft={topLeft}
      topRight={
        <Select value={locale} onValueChange={(v) => setLocale(v as WebLocale)} variant="inline">
          <SelectTrigger aria-label={t("web.shell.language.ariaLabel")} className="text-sm font-medium text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEB_LOCALES.map((code) => (
              <SelectItem key={code} value={code}>
                {getWebLocaleNativeName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      copyright={resolvedCopyright}
      contentClassName={contentClassName}
      frameClassName={frameClassName}
      headerClassName={headerClassName}
      childrenClassName={childrenClassName}
    >
      {children}
    </AuthShell>
  );
}
