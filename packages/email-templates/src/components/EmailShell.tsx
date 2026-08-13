import { Body, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

import { OKKEY_MARK_PNG_DATA_URI } from "../assets/okkey-mark-data-uri.js";

export const EMAIL_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const EMAIL_CANVAS = "#f1f5f9";
export const EMAIL_PRIMARY_TEXT = "#0A0A0A";
export const EMAIL_SECONDARY_TEXT = "#64748b";
export const EMAIL_PRIMARY = "#3B82F6";
export const EMAIL_PRIMARY_FOREGROUND = "#ffffff";

type EmailShellProps = {
  preview: string;
  footer?: string;
  children: React.ReactNode;
};

/** Shared transactional chrome: canvas, white card, logo header, rule, then body. */
export function EmailShell({ preview, footer, children }: EmailShellProps) {
  const trimmedFooter = footer?.trim() ?? "";
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <table cellPadding={0} cellSpacing={0} role="presentation">
              <tr>
                <td style={logoCellStyle}>
                  <Img
                    src={OKKEY_MARK_PNG_DATA_URI}
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
          {trimmedFooter ? (
            <>
              <hr style={ruleStyle} />
              <Text style={footerStyle}>{trimmedFooter}</Text>
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
