export {
  renderAccountEmailChanged,
  renderAuthEmailCode,
  renderContactRecoveryReleaseRequest,
  renderDeviceApprovalRequest,
  renderDeviceRecoveryApprovalRequest,
  renderEmailTemplate,
  renderPlanChangeRequest,
  renderTrustedContactInvite,
  renderTwoFactorBackupRegenerated,
  renderTwoFactorDisabled,
  renderTwoFactorEnabled,
  renderWorkspaceInvite,
  listTemplateMeta,
} from "./pipeline.js";
export { EmailRenderError, type EmailRenderErrorCode } from "./errors.js";
export type { RenderedEmail } from "./rendered.js";
export type {
  AccountEmailChangedVariables,
  AuthEmailCodePurpose,
  AuthEmailCodeVariables,
  ContactRecoveryReleaseRequestVariables,
  DeviceApprovalRequestVariables,
  DeviceRecoveryApprovalRequestVariables,
  EmailTemplateVariablesMap,
  PlanChangeRequestVariables,
  TrustedContactInviteVariables,
  TwoFactorNoticeVariables,
  WorkspaceInviteVariables,
} from "./variables.js";
export { EMAIL_TEMPLATE_VERSIONS, type EmailTemplateId } from "./versions.js";
export { resolveDeviceDetailName } from "./device-display-name.js";
export {
  appendStandardFooterPlain,
  buildEmailStandardFooterCopy,
} from "./standard-footer.js";

export {
  OKKEY_MARK_CID,
  OKKEY_MARK_CONTENT_TYPE,
  OKKEY_MARK_FILENAME,
  OKKEY_MARK_PNG_BASE64,
  okkeyMarkInlineAttachment,
  type OkkeyMarkInlineAttachment,
} from "./assets/okkey-mark.js";
