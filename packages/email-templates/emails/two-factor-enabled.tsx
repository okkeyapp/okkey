import * as React from "react";
import { TwoFactorNoticeEmail } from "../src/components/TwoFactorNoticeEmail.js";
import {
  buildTwoFactorEnabledEmailProps,
  previewSampleTwoFactor,
} from "../src/email-props.js";
import { PREVIEW_LOCALE } from "./preview-locale.js";

export default function TwoFactorEnabledPreview() {
  const props = buildTwoFactorEnabledEmailProps(PREVIEW_LOCALE, previewSampleTwoFactor);
  return <TwoFactorNoticeEmail {...props} />;
}
