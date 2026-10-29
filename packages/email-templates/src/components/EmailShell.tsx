import { Body, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

import { OKKEY_MARK_CID } from "../assets/okkey-mark.js";

export const EMAIL_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Light canvas (body) behind the white card. */
export const EMAIL_CANVAS = "#f1f5f9";
export const EMAIL_CARD = "#ffffff";
export const EMAIL_PRIMARY_TEXT = "#0A0A0A";
export const EMAIL_SECONDARY_TEXT = "#64748b";
export const EMAIL_RULE = "#e5e7eb";
/**
 * CTA blue chosen for WCAG AA normal-text contrast with white (≥4.5:1).
 * `#3B82F6` (web primary) is only ~3.68:1 on white — too low for email CTAs.
 */
export const EMAIL_PRIMARY = "#2563EB";
export const EMAIL_PRIMARY_FOREGROUND = "#ffffff";

/** Dark palette for clients that honour prefers-color-scheme (off-black / off-white). */
export const EMAIL_CANVAS_DARK = "#0f172a";
export const EMAIL_CARD_DARK = "#1e293b";
export const EMAIL_PRIMARY_TEXT_DARK = "#f8fafc";
export const EMAIL_SECONDARY_TEXT_DARK = "#94a3b8";
export const EMAIL_RULE_DARK = "#334155";

/** Stable class hooks for light + dark styles (inline colors remain the light fallback). */
export const EMAIL_CLASS_CANVAS = "okkey-canvas";
export const EMAIL_CLASS_CARD = "okkey-card";
export const EMAIL_CLASS_INK = "okkey-ink";
export const EMAIL_CLASS_MUTED = "okkey-muted";
export const EMAIL_CLASS_RULE = "okkey-rule";
export const EMAIL_CLASS_SURFACE = "okkey-surface";

/**
 * Head CSS: declare dual color-scheme and override class colors in dark mode.
 * `!important` beats react-email inline styles; `[data-ogsb]/[data-ogsc]` help Outlook apps.
 *
 * Do not use `>` child combinators here — react-email HTML-escapes them to `&gt;` inside
 * `<style>`, which breaks the selector. Canvas fill lives on classed elements only;
 * Body `style` must not carry backgroundColor (copied onto an unclassed wrapper td).
 */
const EMAIL_COLOR_SCHEME_CSS = `
:root {
  color-scheme: light dark;
  supported-color-schemes: light dark;
}
.${EMAIL_CLASS_CANVAS} { background-color: ${EMAIL_CANVAS} !important; }
@media (prefers-color-scheme: dark) {
  .${EMAIL_CLASS_CANVAS} { background-color: ${EMAIL_CANVAS_DARK} !important; }
  .${EMAIL_CLASS_CARD} { background-color: ${EMAIL_CARD_DARK} !important; }
  .${EMAIL_CLASS_SURFACE} { background-color: ${EMAIL_CANVAS_DARK} !important; }
  .${EMAIL_CLASS_INK} { color: ${EMAIL_PRIMARY_TEXT_DARK} !important; }
  .${EMAIL_CLASS_MUTED} { color: ${EMAIL_SECONDARY_TEXT_DARK} !important; }
  .${EMAIL_CLASS_RULE} { border-top-color: ${EMAIL_RULE_DARK} !important; }
}
[data-ogsb] .${EMAIL_CLASS_CANVAS} { background-color: ${EMAIL_CANVAS_DARK} !important; }
[data-ogsb] .${EMAIL_CLASS_CARD} { background-color: ${EMAIL_CARD_DARK} !important; }
[data-ogsb] .${EMAIL_CLASS_SURFACE} { background-color: ${EMAIL_CANVAS_DARK} !important; }
[data-ogsc] .${EMAIL_CLASS_INK} { color: ${EMAIL_PRIMARY_TEXT_DARK} !important; }
[data-ogsc] .${EMAIL_CLASS_MUTED} { color: ${EMAIL_SECONDARY_TEXT_DARK} !important; }
[data-ogsb] .${EMAIL_CLASS_RULE} { border-top-color: ${EMAIL_RULE_DARK} !important; }
`.trim();

type EmailShellProps = {
  /** BCP-47 language for `<html lang>` — must match the email locale. */
  lang?: string;
  /** Document title — same string as the email subject. */
  title: string;
  preview: string;
  /** Shared two-line footer below the separator (no per-email footnotes). */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

/** Shared transactional chrome: canvas, white card, logo header, rule, then body. */
export function EmailShell({ lang = "en", title, preview, footer, children }: EmailShellProps) {
  const hasFooter =
    footer !== undefined &&
    footer !== null &&
    !(typeof footer === "string" && footer.trim().length === 0);
  return (
    <Html lang={lang} dir="ltr">
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style type="text/css">{EMAIL_COLOR_SCHEME_CSS}</style>
      </Head>
      {/*
        Do not put backgroundColor/padding on Body `style`: react-email copies the full
        style object onto an inner wrapper <td> without className, which leaves a light
        frame in dark mode. Padding + canvas fill live on our classed wrapper table/td.
        `bgcolor` is an HTML attribute (not copied onto the wrapper td) for clients that
        strip <style>; cast because @react-email/body typings omit the legacy attr.
        Preview must be the first child of Body so inbox clients pick up the preheader.
      */}
      <Body
        className={EMAIL_CLASS_CANVAS}
        style={bodyStyle}
        {...({ bgcolor: EMAIL_CANVAS } as Record<string, string>)}
      >
        <Preview>{preview}</Preview>
        <table
          border={0}
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          align="center"
          className={EMAIL_CLASS_CANVAS}
          style={canvasTableStyle}
        >
          <tbody>
            <tr>
              <td className={EMAIL_CLASS_CANVAS} style={canvasCellStyle}>
                <Container className={EMAIL_CLASS_CARD} style={containerStyle}>
                  <Section style={headerStyle}>
                    <table cellPadding={0} cellSpacing={0} role="presentation">
                      <tr>
                        <td style={logoCellStyle}>
                          <Img
                            src={`cid:${OKKEY_MARK_CID}`}
                            width={32}
                            height={32}
                            alt="Okkey"
                            style={logoImgStyle}
                          />
                        </td>
                        <td style={wordmarkCellStyle}>
                          <span className={EMAIL_CLASS_INK} style={wordmarkStyle}>
                            Okkey
                          </span>
                        </td>
                      </tr>
                    </table>
                  </Section>
                  <hr className={EMAIL_CLASS_RULE} style={ruleStyle} />
                  {children}
                  {hasFooter ? (
                    <>
                      <hr className={EMAIL_CLASS_RULE} style={ruleStyle} />
                      {typeof footer === "string" ? (
                        <Text className={EMAIL_CLASS_MUTED} style={footerStyle}>
                          {footer.trim()}
                        </Text>
                      ) : (
                        footer
                      )}
                    </>
                  ) : null}
                </Container>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

/** Margin/padding only — never backgroundColor (see Body note above). */
const bodyStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
};

const canvasTableStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: EMAIL_CANVAS,
  borderCollapse: "collapse",
};

const canvasCellStyle: React.CSSProperties = {
  fontFamily: EMAIL_FONT_FAMILY,
  backgroundColor: EMAIL_CANVAS,
  margin: 0,
  padding: "32px 12px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "520px",
  margin: "0 auto",
  backgroundColor: EMAIL_CARD,
  padding: "32px 36px",
  borderRadius: "8px",
};

const headerStyle: React.CSSProperties = {
  margin: "0 0 8px",
};

const logoCellStyle: React.CSSProperties = {
  verticalAlign: "middle",
  paddingRight: "10px",
  width: "32px",
};

const logoImgStyle: React.CSSProperties = {
  display: "block",
  border: 0,
  outline: "none",
};

const wordmarkCellStyle: React.CSSProperties = {
  verticalAlign: "middle",
};

const wordmarkStyle: React.CSSProperties = {
  fontFamily: EMAIL_FONT_FAMILY,
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: "32px",
  color: EMAIL_PRIMARY_TEXT,
  letterSpacing: "-0.02em",
};

const ruleStyle: React.CSSProperties = {
  border: "none",
  borderTop: `1px solid ${EMAIL_RULE}`,
  margin: "20px 0",
};

const footerStyle: React.CSSProperties = {
  fontFamily: EMAIL_FONT_FAMILY,
  fontSize: "13px",
  lineHeight: "20px",
  color: EMAIL_SECONDARY_TEXT,
  margin: 0,
};
