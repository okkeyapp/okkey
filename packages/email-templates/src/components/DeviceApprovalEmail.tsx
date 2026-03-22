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

export interface DeviceApprovalEmailProps {
  lead: string;
  deviceLine: string;
  platformLine: string;
  ipLine: string;
  helpUrl: string;
  ctaLabel: string;
  noteNoUrl: string;
}

export function DeviceApprovalEmail({
  lead,
  deviceLine,
  platformLine,
  ipLine,
  helpUrl,
  ctaLabel,
  noteNoUrl,
}: DeviceApprovalEmailProps) {
  const hasUrl = helpUrl.trim().length > 0;
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={textStyle}>{lead}</Text>
          <Section style={listStyle}>
            <Text style={listItemStyle}>{deviceLine}</Text>
            <Text style={listItemStyle}>{platformLine}</Text>
            <Text style={listItemStyle}>{ipLine}</Text>
          </Section>
          {hasUrl ? (
            <Text style={textStyle}>
              <Link href={helpUrl}>{ctaLabel}</Link>
            </Text>
          ) : (
            <Text style={textStyle}>{noteNoUrl}</Text>
          )}
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

const listStyle: React.CSSProperties = { margin: "0 0 16px" };

const listItemStyle: React.CSSProperties = {
  ...textStyle,
  margin: "0 0 4px",
};
