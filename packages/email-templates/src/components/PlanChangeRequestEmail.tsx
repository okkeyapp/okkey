import { Text } from "@react-email/components";
import * as React from "react";

import { EMAIL_PRIMARY_TEXT, EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";

export interface PlanChangeRequestEmailProps {
  lead: string;
  lines: readonly string[];
}

export function PlanChangeRequestEmail({ lead, lines }: PlanChangeRequestEmailProps) {
  return (
    <EmailShell preview={lead}>
      <Text style={leadStyle}>{lead}</Text>
      {lines.map((line) => (
        <Text key={line} style={lineStyle}>
          {line}
        </Text>
      ))}
    </EmailShell>
  );
}

const leadStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: EMAIL_PRIMARY_TEXT,
  margin: "0 0 16px",
};

const lineStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: EMAIL_SECONDARY_TEXT,
  margin: "0 0 8px",
};
