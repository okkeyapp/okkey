import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

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
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={textStyle}>{line1}</Text>
          <Text style={textStyle}>{line2}</Text>
          {hasUrl ? (
            <Section style={{ marginTop: "8px" }}>
              <Text style={textStyle}>
                <Link href={securityUrl}>{ctaLabel}</Link>
              </Text>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  backgroundColor: "#f6f6f6",
  margin: 0,
  padding: "24px 0",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "480px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  padding: "24px",
  borderRadius: "8px",
};

const textStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#111827",
  margin: "0 0 12px",
};
