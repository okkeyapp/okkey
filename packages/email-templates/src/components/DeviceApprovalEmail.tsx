import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import { EMAIL_PRIMARY_TEXT, EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";

export interface DeviceApprovalEmailProps {
  lead: string;
  deviceLine: string;
  platformLine: string;
  whenLine: string;
  ipLine: string;
  locationLine: string;
  helpUrl: string;
  ctaLabel: string;
  noteNoUrl: string;
}

export function DeviceApprovalEmail({
  lead,
  deviceLine,
  platformLine,
  whenLine,
  ipLine,
  locationLine,
  helpUrl,
  ctaLabel,
  noteNoUrl,
}: DeviceApprovalEmailProps) {
  const hasUrl = helpUrl.trim().length > 0;
  return (
    <EmailShell preview={lead}>
      <Text style={leadStyle}>{lead}</Text>
      <Section style={listStyle}>
        <Text style={metaStyle}>{deviceLine}</Text>
        <Text style={metaStyle}>{platformLine}</Text>
        {whenLine ? <Text style={metaStyle}>{whenLine}</Text> : null}
        <Text style={metaStyle}>{ipLine}</Text>
        {locationLine ? <Text style={metaStyle}>{locationLine}</Text> : null}
      </Section>
      {hasUrl ? (
        <Section style={ctaWrapStyle}>
          <EmailPrimaryButton href={helpUrl}>{ctaLabel}</EmailPrimaryButton>
        </Section>
      ) : (
        <Text style={noteStyle}>{noteNoUrl}</Text>
      )}
    </EmailShell>
  );
}

const leadStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: EMAIL_PRIMARY_TEXT,
  margin: "0 0 16px",
};

const listStyle: React.CSSProperties = {
  margin: "0 0 20px",
};

const metaStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: EMAIL_SECONDARY_TEXT,
  margin: "0 0 4px",
};

const noteStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: EMAIL_SECONDARY_TEXT,
  margin: 0,
};

const ctaWrapStyle: React.CSSProperties = {
  marginTop: "4px",
};
