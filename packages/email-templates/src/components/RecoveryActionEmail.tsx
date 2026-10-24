import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import { EMAIL_PRIMARY_TEXT, EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";
import { EmailStandardFooter } from "./EmailStandardFooter.js";

export interface RecoveryActionEmailProps {
  lead: string;
  detailLine: string;
  /** Optional second meta line (e.g. contact recovery "Requested: …"). */
  requestLine?: string;
  expiresLine: string;
  helpUrl: string;
  ctaLabel: string;
  noteNoUrl: string;
  noteIgnore: string;
  noReply: string;
  /** Empty for security mail (contact recovery); invites keep the shared ignore line. */
  ignoreIfMistake?: string;
}

/** Shared layout for enterprise recovery notify emails (device approve / contact release / invite). */
export function RecoveryActionEmail({
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
      preview={lead}
      footer={
        <EmailStandardFooter
          footnotes={<Text style={footnoteStyle}>{noteIgnore}</Text>}
          noReply={noReply}
          ignoreIfMistake={ignoreIfMistake}
        />
      }
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
  marginBottom: 0,
};

const footnoteStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: EMAIL_SECONDARY_TEXT,
  margin: "0 0 8px",
};
