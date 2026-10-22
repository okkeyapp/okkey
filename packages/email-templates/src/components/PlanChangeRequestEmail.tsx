import { Text } from "@react-email/components";
import * as React from "react";

import { EMAIL_SECONDARY_TEXT, EmailShell } from "./EmailShell.js";

export interface PlanChangeRequestEmailProps {
  lines: readonly string[];
}

/** Plain field-list body (same lines as mailto); no lead/marketing copy. */
export function PlanChangeRequestEmail({ lines }: PlanChangeRequestEmailProps) {
  const preview = lines[0] ?? "License request";
  return (
    <EmailShell preview={preview}>
      {lines.map((line) => (
        <Text key={line} style={lineStyle}>
          {line}
        </Text>
      ))}
    </EmailShell>
  );
}

const lineStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: EMAIL_SECONDARY_TEXT,
  margin: "0 0 8px",
};
