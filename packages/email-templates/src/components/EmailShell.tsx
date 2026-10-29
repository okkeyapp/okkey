import { Body, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

import { OKKEY_MARK_CID } from "../assets/okkey-mark.js";

export const EMAIL_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const EMAIL_CANVAS = "#f1f5f9";
export const EMAIL_PRIMARY_TEXT = "#0A0A0A";
export const EMAIL_SECONDARY_TEXT = "#64748b";
export const EMAIL_PRIMARY = "#3B82F6";
export const EMAIL_PRIMARY_FOREGROUND = "#ffffff";

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
        <meta name="color-scheme" content="light" />
      </Head>
      <Body style={bodyStyle}>
        {/* Preview must live inside <body> so inbox clients pick up the preheader. */}
        <Preview>{preview}</Preview>
        <Container style={containerStyle}>
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
                  <span style={wordmarkStyle}>Okkey</span>
                </td>
              </tr>
            </table>
          </Section>
          <hr style={ruleStyle} />
          {children}
          {hasFooter ? (
            <>
              <hr style={ruleStyle} />
              {typeof footer === "string" ? (
                <Text style={footerStyle}>{footer.trim()}</Text>
              ) : (
                footer
              )}
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  fontFamily: EMAIL_FONT_FAMILY,
  backgroundColor: EMAIL_CANVAS,
  margin: 0,
  padding: "32px 12px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "520px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
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
  borderTop: "1px solid #e5e7eb",
  margin: "20px 0",
};

const footerStyle: React.CSSProperties = {
  fontFamily: EMAIL_FONT_FAMILY,
  fontSize: "13px",
  lineHeight: "20px",
  color: EMAIL_SECONDARY_TEXT,
  margin: 0,
};
