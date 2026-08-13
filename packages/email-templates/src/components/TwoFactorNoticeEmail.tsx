import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import { EMAIL_PRIMARY_TEXT, EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";

export interface TwoFactorNoticeEmailProps {
  line1: string;
  line2: string;
  securityUrl: string;
  ctaLabel: string;
}

export function TwoFactorNoticeEmail({
  line1,
  line2,
  securityUrl,
  ctaLabel,
}: TwoFactorNoticeEmailProps) {
  const hasUrl = securityUrl.trim().length > 0;
  return (
    <EmailShell preview={line1}>
      <Text style={leadStyle}>{line1}</Text>
      <Text style={noteStyle}>{line2}</Text>
      {hasUrl ? (
        <Section style={ctaWrapStyle}>
          <EmailPrimaryButton href={securityUrl}>{ctaLabel}</EmailPrimaryButton>
        </Section>
      ) : null}
    </EmailShell>
  );
}

const leadStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: EMAIL_PRIMARY_TEXT,
  margin: "0 0 12px",
};

const noteStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: EMAIL_SECONDARY_TEXT,
  margin: 0,
};

const ctaWrapStyle: React.CSSProperties = {
  marginTop: "20px",
};
