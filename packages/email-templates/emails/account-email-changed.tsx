import * as React from "react";
import { TwoFactorNoticeEmail } from "../src/components/TwoFactorNoticeEmail.js";
import {
  buildAccountEmailChangedEmailProps,
  previewSampleAccountEmailChanged,
} from "../src/email-props.js";
import { PREVIEW_LOCALE } from "./preview-locale.js";

export default function AccountEmailChangedPreview() {
  const props = buildAccountEmailChangedEmailProps(
    PREVIEW_LOCALE,
    previewSampleAccountEmailChanged,
  );
  return <TwoFactorNoticeEmail {...props} />;
}
