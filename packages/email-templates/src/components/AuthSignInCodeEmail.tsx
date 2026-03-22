import { Body, Container, Head, Html, Section, Text } from "@react-email/components";
import * as React from "react";

export interface AuthSignInCodeEmailProps {
  beforeCode: string;
  code: string;
  line2: string;
}

export function AuthSignInCodeEmail({ beforeCode, code, line2 }: AuthSignInCodeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text style={textStyle}>
              {beforeCode} <strong>{code}</strong>
            </Text>
            <Text style={textStyle}>{line2}</Text>
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
  margin: "0 0 12px",
};
