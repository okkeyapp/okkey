import { Body, Head, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

/**
 * License / plan-change sales mail is intentionally plain: no shared EmailShell,
 * logo header, card chrome, or no-reply footer (sales inbox exception).
 */
export interface PlanChangeRequestEmailProps {
  locale?: string;
  lead: string;
  lines: readonly string[];
}

export function PlanChangeRequestEmail({ locale = "en", lead, lines }: PlanChangeRequestEmailProps) {
  const htmlLang = locale === "ru" ? "ru" : "en";
  return (
    <Html lang={htmlLang}>
      <Head />
      <Preview>{lead}</Preview>
      <Body style={bodyStyle}>
        <Text style={leadStyle}>{lead}</Text>
        {lines.map((line) => (
          <Text key={line} style={lineStyle}>
            {line}
          </Text>
        ))}
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  backgroundColor: "#ffffff",
  margin: 0,
  padding: "16px 12px",
  color: "#0A0A0A",
};

const leadStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#0A0A0A",
  margin: "0 0 16px",
};

const lineStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#334155",
  margin: "0 0 8px",
};
