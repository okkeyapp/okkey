import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import {
  EMAIL_CLASS_INK,
  EMAIL_CLASS_MUTED,
  EMAIL_PRIMARY_TEXT,
  EMAIL_SECONDARY_TEXT,
  EmailShell,
} from "./EmailShell.js";
import { EmailStandardFooter } from "./EmailStandardFooter.js";

export interface WorkspaceInviteEmailProps {
  lang: string;
  title: string;
  intro: string;
  roleLine: string;
  inviterEmailLine: string;
  expiresLine: string;
  ctaLabel: string;
  inviteUrl: string;
  noReply: string;
  ignoreIfMistake: string;
}

export function WorkspaceInviteEmail({
  lang,
  title,
  intro,
  roleLine,
  inviterEmailLine,
  expiresLine,
  ctaLabel,
  inviteUrl,
  noReply,
  ignoreIfMistake,
}: WorkspaceInviteEmailProps) {
  const metaLines = [roleLine, inviterEmailLine, expiresLine].filter((line) => line.trim().length > 0);
  return (
    <EmailShell
      lang={lang}
      title={title}
      preview={intro}
      footer={<EmailStandardFooter noReply={noReply} ignoreIfMistake={ignoreIfMistake} />}
    >
      <Text className={EMAIL_CLASS_INK} style={leadStyle}>
        {intro}
      </Text>
      {metaLines.length > 0 ? (
        <Section style={listStyle}>
          {metaLines.map((line) => (
            <Text key={line} className={EMAIL_CLASS_MUTED} style={metaStyle}>
              {line}
            </Text>
          ))}
        </Section>
      ) : null}
      <Section style={ctaWrapStyle}>
        <EmailPrimaryButton href={inviteUrl}>{ctaLabel}</EmailPrimaryButton>
      </Section>
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

const ctaWrapStyle: React.CSSProperties = {
  marginTop: "4px",
};
