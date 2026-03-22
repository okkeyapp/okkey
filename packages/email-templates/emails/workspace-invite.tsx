import * as React from "react";
import { WorkspaceInviteEmail } from "../src/components/WorkspaceInviteEmail.js";
import {
  buildWorkspaceInviteEmailProps,
  previewSampleWorkspaceInvite,
} from "../src/email-props.js";
import { PREVIEW_LOCALE } from "./preview-locale.js";

export default function WorkspaceInvitePreview() {
  const props = buildWorkspaceInviteEmailProps(PREVIEW_LOCALE, previewSampleWorkspaceInvite);
  return <WorkspaceInviteEmail {...props} />;
}
