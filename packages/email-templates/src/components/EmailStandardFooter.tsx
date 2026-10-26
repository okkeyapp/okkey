import { Text } from "@react-email/components";
import * as React from "react";

import { EMAIL_SECONDARY_TEXT } from "./EmailShell.js";

export interface EmailStandardFooterProps {
  /** Optional contextual notes above the shared two-line footer. */
  footnotes?: React.ReactNode;
  noReply: string;
  ignoreIfMistake: string;
}

/** Shared two-line footer for all transactional emails (no exceptions). */
export function EmailStandardFooter({
  footnotes,
  noReply,
  ignoreIfMistake,
}: EmailStandardFooterProps) {
  return (
    <>
      {footnotes}
      <Text style={footnotes ? footnoteStyle : footnoteStyleFirst}>{noReply}</Text>
      <Text style={footnoteStyleLast}>{ignoreIfMistake}</Text>
    </>
  );
}

const footnoteStyleFirst: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: EMAIL_SECONDARY_TEXT,
  margin: "0 0 8px",
};

const footnoteStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: EMAIL_SECONDARY_TEXT,
  margin: "0 0 8px",
};

const footnoteStyleLast: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: EMAIL_SECONDARY_TEXT,
  margin: 0,
};
