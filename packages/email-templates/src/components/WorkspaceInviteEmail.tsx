import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import { EMAIL_PRIMARY_TEXT, EmailShell } from "./EmailShell.js";
import { EmailStandardFooter } from "./EmailStandardFooter.js";

export interface WorkspaceInviteEmailProps {
  lang: string;
  intro: string;
  ctaLabel: string;
  inviteUrl: string;
  noReply: string;
  ignoreIfMistake: string;
}

export function WorkspaceInviteEmail({
  lang,
  intro,
  ctaLabel,
  inviteUrl,
  noReply,
  ignoreIfMistake,
}: WorkspaceInviteEmailProps) {
  return (
    <EmailShell
      lang={lang}
      preview={intro}
      footer={<EmailStandardFooter noReply={noReply} ignoreIfMistake={ignoreIfMistake} />}
    >
      <Text style={leadStyle}>{intro}</Text>
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
  margin: 0,
};

const ctaWrapStyle: React.CSSProperties = {
  marginTop: "20px",
};
