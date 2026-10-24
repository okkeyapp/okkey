import { Text } from "@react-email/components";
import * as React from "react";

import { EMAIL_SECONDARY_TEXT } from "./EmailShell.js";

export interface EmailStandardFooterProps {
  /** Optional contextual notes above the shared no-reply / mistake lines. */
  footnotes?: React.ReactNode;
  noReply: string;
  /** Omit or pass empty for security emails (no “ignore if mistake”). */
  ignoreIfMistake?: string;
}

/** Shared no-reply footer; optional mistake line for non-security mail. */
export function EmailStandardFooter({
  footnotes,
  noReply,
  ignoreIfMistake,
}: EmailStandardFooterProps) {
  const ignore = ignoreIfMistake?.trim() ?? "";
  const hasIgnore = ignore.length > 0;
  return (
    <>
      {footnotes}
      <Text style={hasIgnore ? (footnotes ? footnoteStyle : footnoteStyleFirst) : footnoteStyleLast}>
        {noReply}
      </Text>
      {hasIgnore ? <Text style={footnoteStyleLast}>{ignore}</Text> : null}
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
