import * as React from "react";
import { DeviceApprovalEmail } from "../src/components/DeviceApprovalEmail.js";
import {
  buildDeviceApprovalEmailProps,
  previewSampleDeviceApproval,
} from "../src/email-props.js";
import { PREVIEW_LOCALE } from "./preview-locale.js";

export default function DeviceApprovalPreview() {
  const props = buildDeviceApprovalEmailProps(PREVIEW_LOCALE, previewSampleDeviceApproval);
  return <DeviceApprovalEmail {...props} />;
}
