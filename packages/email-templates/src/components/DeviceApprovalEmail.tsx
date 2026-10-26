import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import { EMAIL_PRIMARY_TEXT, EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";
import { EmailStandardFooter } from "./EmailStandardFooter.js";

export interface DeviceApprovalEmailProps {
  lang: string;
  lead: string;
  deviceLine: string;
  whenLine: string;
  /** Expiry for device approval and recovery requests. */
  expiresLine?: string;
  ipLine: string;
  locationLine: string;
  helpUrl: string;
  ctaLabel: string;
  /** Always shown: where to confirm on a trusted device. */
  noteConfirmWhere: string;
  noteNoUrl: string;
  /** Body warning at the bottom, above the shared footer separator. */
  noteBlockIfNotYou: string;
  noReply: string;
  ignoreIfMistake: string;
}

export function DeviceApprovalEmail({
  lang,
  lead,
  deviceLine,
  whenLine,
  expiresLine,
  ipLine,
  locationLine,
  helpUrl,
  ctaLabel,
  noteConfirmWhere,
  noteNoUrl,
  noteBlockIfNotYou,
  noReply,
  ignoreIfMistake,
}: DeviceApprovalEmailProps) {
  const hasUrl = helpUrl.trim().length > 0;
  return (
    <EmailShell
      lang={lang}
      preview={lead}
      footer={<EmailStandardFooter noReply={noReply} ignoreIfMistake={ignoreIfMistake} />}
    >
      <Text style={leadStyle}>{lead}</Text>
      <Section style={listStyle}>
        <Text style={metaStyle}>{deviceLine}</Text>
        {whenLine ? <Text style={metaStyle}>{whenLine}</Text> : null}
        {expiresLine ? <Text style={metaStyle}>{expiresLine}</Text> : null}
        <Text style={metaStyle}>{ipLine}</Text>
        {locationLine ? <Text style={metaStyle}>{locationLine}</Text> : null}
      </Section>
      {hasUrl ? (
        <>
          <Text style={noteStyle}>{noteConfirmWhere}</Text>
          <Section style={ctaWrapStyle}>
            <EmailPrimaryButton href={helpUrl}>{ctaLabel}</EmailPrimaryButton>
          </Section>
        </>
      ) : (
        <Text style={noteStyle}>{noteNoUrl}</Text>
      )}
      <Text style={warningStyle}>{noteBlockIfNotYou}</Text>
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
  margin: "0 0 16px",
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
  margin: "0 0 16px",
};

const ctaWrapStyle: React.CSSProperties = {
  marginTop: "4px",
  marginBottom: "16px",
};

const warningStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: EMAIL_SECONDARY_TEXT,
  margin: 0,
};
