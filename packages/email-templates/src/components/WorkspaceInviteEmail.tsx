import { Body, Button, Container, Head, Html, Section, Text } from "@react-email/components";
import * as React from "react";

export interface WorkspaceInviteEmailProps {
  intro: string;
  ctaLabel: string;
  inviteUrl: string;
}

export function WorkspaceInviteEmail({ intro, ctaLabel, inviteUrl }: WorkspaceInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={textStyle}>{intro}</Text>
          <Section style={{ marginTop: "16px" }}>
            <Button href={inviteUrl} style={buttonStyle}>
              {ctaLabel}
            </Button>
          </Section>
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
  margin: "0",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#111827",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "6px",
  fontWeight: 600,
};
