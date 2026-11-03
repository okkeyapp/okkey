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

export interface TwoFactorNoticeEmailProps {
  lang: string;
  title: string;
  line1: string;
  line2: string;
  securityUrl: string;
  ctaLabel: string;
  noReply: string;
  ignoreIfMistake: string;
}

export function TwoFactorNoticeEmail({
  lang,
  title,
  line1,
  line2,
  securityUrl,
  ctaLabel,
  noReply,
  ignoreIfMistake,
}: TwoFactorNoticeEmailProps) {
  const hasUrl = securityUrl.trim().length > 0;
  return (
    <EmailShell
      lang={lang}
      title={title}
      preview={line1}
      footer={<EmailStandardFooter noReply={noReply} ignoreIfMistake={ignoreIfMistake} />}
    >
      <Text className={EMAIL_CLASS_INK} style={leadStyle}>
        {line1}
      </Text>
      <Text className={EMAIL_CLASS_MUTED} style={noteStyle}>
        {line2}
      </Text>
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
