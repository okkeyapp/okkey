import * as React from "react";
import { AuthSignInCodeEmail } from "../src/components/AuthSignInCodeEmail.js";
import {
  buildAuthSignInCodeEmailProps,
  previewSampleAuthCode,
} from "../src/email-props.js";
import { PREVIEW_LOCALE } from "./preview-locale.js";

export default function AuthSignInCodePreview() {
  const props = buildAuthSignInCodeEmailProps(PREVIEW_LOCALE, previewSampleAuthCode);
  return <AuthSignInCodeEmail {...props} />;
}
