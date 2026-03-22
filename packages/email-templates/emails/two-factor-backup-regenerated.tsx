import * as React from "react";
import { TwoFactorNoticeEmail } from "../src/components/TwoFactorNoticeEmail.js";
import {
  buildTwoFactorBackupRegeneratedEmailProps,
  previewSampleTwoFactor,
} from "../src/email-props.js";
import { PREVIEW_LOCALE } from "./preview-locale.js";

export default function TwoFactorBackupRegeneratedPreview() {
  const props = buildTwoFactorBackupRegeneratedEmailProps(
    PREVIEW_LOCALE,
    previewSampleTwoFactor,
  );
  return <TwoFactorNoticeEmail {...props} />;
}
