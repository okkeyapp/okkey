import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import { EMAIL_PRIMARY_TEXT, EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";
import { EmailStandardFooter } from "./EmailStandardFooter.js";

export interface RecoveryActionEmailProps {
  lang: string;
  lead: string;
  detailLine: string;
  /** Optional second meta line (e.g. contact recovery "Requested: …"). */
  requestLine?: string;
  expiresLine: string;
  helpUrl: string;
  ctaLabel: string;
  noteNoUrl: string;
  /** Body warning at the bottom, above the shared footer separator. */
  noteIgnore: string;
  noReply: string;
  ignoreIfMistake: string;
}

/** Shared layout for enterprise recovery notify emails (contact release / invite). */
export function RecoveryActionEmail({
  lang,
  lead,
  detailLine,
  requestLine,
  expiresLine,
  helpUrl,
  ctaLabel,
  noteNoUrl,
  noteIgnore,
  noReply,
  ignoreIfMistake,
}: RecoveryActionEmailProps) {
  const hasUrl = helpUrl.trim().length > 0;
  return (
    <EmailShell
      lang={lang}
      preview={lead}
      footer={<EmailStandardFooter noReply={noReply} ignoreIfMistake={ignoreIfMistake} />}
    >
      <Text style={leadStyle}>{lead}</Text>
      <Section style={listStyle}>
        <Text style={metaStyle}>{detailLine}</Text>
        {requestLine ? <Text style={metaStyle}>{requestLine}</Text> : null}
        {expiresLine ? <Text style={metaStyle}>{expiresLine}</Text> : null}
      </Section>
      {hasUrl ? (
        <Section style={ctaWrapStyle}>
          <EmailPrimaryButton href={helpUrl}>{ctaLabel}</EmailPrimaryButton>
        </Section>
      ) : (
        <Text style={noteStyle}>{noteNoUrl}</Text>
      )}
      <Text style={warningStyle}>{noteIgnore}</Text>
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
