import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EMAIL_CANVAS, EMAIL_PRIMARY_TEXT, EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";

export interface AuthSignInCodeEmailProps {
  beforeCode: string;
  code: string;
  line2: string;
  ignore: string;
}

function formatOtpDisplay(code: string): string {
  if (code.length !== 6) {
    return code;
  }
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function AuthSignInCodeEmail({ beforeCode, code, line2, ignore }: AuthSignInCodeEmailProps) {
  const displayCode = formatOtpDisplay(code);
  return (
    <EmailShell preview={beforeCode} footer={ignore}>
      <Text style={leadStyle}>{beforeCode}</Text>
      <Section style={codeWrapStyle}>
        <table
          align="center"
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          style={codeTableStyle}
        >
          <tr>
            <td style={codeCellStyle}>
              <span style={codeStyle}>{displayCode}</span>
            </td>
          </tr>
        </table>
      </Section>
      <Text style={noteStyle}>{line2}</Text>
    </EmailShell>
  );
}

const leadStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: EMAIL_PRIMARY_TEXT,
  margin: "0 0 8px",
};

const codeWrapStyle: React.CSSProperties = {
  margin: "20px 0 24px",
  textAlign: "center",
};

const codeTableStyle: React.CSSProperties = {
  margin: "0 auto",
  backgroundColor: EMAIL_CANVAS,
  borderRadius: "8px",
};

const codeCellStyle: React.CSSProperties = {
  padding: "16px 32px",
  textAlign: "center",
};

const codeStyle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  lineHeight: "36px",
  letterSpacing: "0.08em",
  color: EMAIL_PRIMARY_TEXT,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const noteStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: EMAIL_SECONDARY_TEXT,
  margin: "0 0 8px",
};
