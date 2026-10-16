import * as React from "react";
import { TwoFactorNoticeEmail } from "../src/components/TwoFactorNoticeEmail.js";
import {
  buildTwoFactorDisabledEmailProps,
  previewSampleTwoFactor,
} from "../src/email-props.js";
import { PREVIEW_LOCALE } from "./preview-locale.js";

export default function TwoFactorDisabledPreview() {
  const props = buildTwoFactorDisabledEmailProps(PREVIEW_LOCALE, previewSampleTwoFactor);
  return <TwoFactorNoticeEmail {...props} />;
}
