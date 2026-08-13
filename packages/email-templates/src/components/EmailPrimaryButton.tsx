import { Button } from "@react-email/components";
import * as React from "react";

import {
  EMAIL_FONT_FAMILY,
  EMAIL_PRIMARY,
  EMAIL_PRIMARY_FOREGROUND,
} from "./EmailShell.js";

type EmailPrimaryButtonProps = {
  href: string;
  children: React.ReactNode;
};

/**
 * Matches web primary Button, size default: h-9 (36px), px-4 py-2, rounded-md (8px),
 * text-sm / font-medium, bg-primary (#3B82F6) / text-primary-foreground.
 */
export function EmailPrimaryButton({ href, children }: EmailPrimaryButtonProps) {
  return (
    <Button href={href} style={buttonStyle}>
      {children}
    </Button>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: EMAIL_PRIMARY,
  color: EMAIL_PRIMARY_FOREGROUND,
  fontFamily: EMAIL_FONT_FAMILY,
  fontSize: "14px",
  fontWeight: 500,
  lineHeight: "20px",
  padding: "8px 16px",
  borderRadius: "8px",
  textDecoration: "none",
  textAlign: "center",
  boxSizing: "border-box",
};
