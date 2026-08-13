import { Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailPrimaryButton } from "./EmailPrimaryButton.js";
import { EMAIL_PRIMARY_TEXT, EmailShell } from "./EmailShell.js";

export interface WorkspaceInviteEmailProps {
  intro: string;
  ctaLabel: string;
  inviteUrl: string;
}

export function WorkspaceInviteEmail({ intro, ctaLabel, inviteUrl }: WorkspaceInviteEmailProps) {
  return (
    <EmailShell preview={intro}>
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
