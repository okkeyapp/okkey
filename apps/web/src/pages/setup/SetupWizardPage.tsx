import {
  buildRegistrationCryptoArtifacts,
  deriveLoginKey,
  generateRecoverySecret,
  initCrypto,
  registrationArtifactsToWire,
  wipeBytes,
  recoveryPossessionPublicKey,
  wrapVaultKeyWithRecoverySecret,
} from "@okkey/crypto";
import {
  MASTER_PASSWORD_POLICY_VERSION,
  MIN_MASTER_PASSWORD_LENGTH,
  masterPasswordMeetsNewPasswordPolicy,
  type RegisterCompleteRequestDto,
  type ServerMailSettingsResponseDto,
  type SmtpTlsMode,
} from "@okkey/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@okkey/ui";
import { Check, Copy, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type SVGProps } from "react";
import { flushSync } from "react-dom";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { clearSplitKeyShareWrapKey, persistSplitKeyShareWrapKey } from "@okkey/vault";

import { createAuthenticatedCoreClient } from "../../api/client";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { downloadRecoveryKeyPdf } from "../../components/settings/recoveryKeyPdf";
import { RecoveryInfoTriangleIcon } from "../../components/settings/RecoveryInfoTriangleIcon";
import WorkspaceLogoTile from "../../components/workspace/WorkspaceLogoTile";
import WorkspaceTileColorPicker from "../../components/workspace/settings/WorkspaceTileColorPicker";
import { DEFAULT_WORKSPACE_TILE_COLOR } from "../../components/workspace/settings/workspaceSettingsCatalog";
import { UploadIcon } from "../../components/workspace/settings/workspaceSettingsIcons";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { assertWorkspaceLogoImage, commitWorkspaceLogoReplacement } from "../../workspace/logoImage";
import { bytesToBase64 } from "../../auth/base64";
import { parseBrowserEnvironment } from "../../auth/browserEnvironment";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { ensureDeviceSigningPublicKey } from "../../auth/deviceSigningKey";
import { finalizePendingVaultBundle } from "../../auth/localVaultBundle";
import { writeLastLoginMethodHint } from "../../auth/loginMethodStorage";
import { writeStoredCurrentWorkspaceId } from "../../auth/workspaceStorage";
import { useLocale } from "../../locale/LocaleContext";
import { AUTH_EMAIL_PATH, ITEMS_PATH, WORKSPACE_QUERY_PARAM } from "../../routes/paths";
import {
  createSetupApiClient,
  type SetupSmtpProviderDto,
} from "../../setup/setupApi";
import { registrationStepAfterRecoveryEnroll } from "../auth/registrationRecoveryStep";
import { runSetupLogoUpload, setupLogoUploadDecision } from "./setupLogoUpload";

type WizardStep = "code" | "mail" | "server" | "owner" | "password" | "recovery" | "finishing";

const TLS_MODES: SmtpTlsMode[] = ["none", "starttls", "tls"];
const TEST_EMAIL_TIMEOUT_SECONDS = 30;
const TEST_EMAIL_CLIENT_TIMEOUT_MS = TEST_EMAIL_TIMEOUT_SECONDS * 1000 + 1_500;
const RECOVERY_COPY_SUCCESS_MS = 3000;

function RequirementCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RequirementCrossIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function messageFromError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { message?: unknown; error?: unknown } }).body;
    if (typeof body?.message === "string" && body.message.trim()) {
      return body.message;
    }
    if (body?.error === "SETUP_CODE_INVALID") {
      return "SETUP_CODE_INVALID";
    }
    if (body?.error === "SETUP_CODE_LOCKED") {
      return "SETUP_CODE_LOCKED";
    }
  }
  return fallback;
}

export default function SetupWizardPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const {
    authClient,
    applyAccessTokenResponse,
    tryUnlockWithMasterPassword,
    updateLocalProfile,
    setRegistrationAuthStateId,
    clearEmailLoginFlow,
    saveVaultBundle,
  } = useAuthVault();

  const setupApi = useMemo(() => createSetupApiClient(), []);
  const [statusLoading, setStatusLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [step, setStep] = useState<WizardStep>("code");
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");

  const [providers, setProviders] = useState<SetupSmtpProviderDto[]>([]);
  const [providerId, setProviderId] = useState("custom");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpTlsMode, setSmtpTlsMode] = useState<SmtpTlsMode>("starttls");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [smtpActive, setSmtpActive] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSecondsLeft, setTestSecondsLeft] = useState(TEST_EMAIL_TIMEOUT_SECONDS);
  const [testFailedMessage, setTestFailedMessage] = useState<string | null>(null);

  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"open" | "invite_only">("open");

  const [ownerEmail, setOwnerEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [tileColor, setTileColor] = useState(DEFAULT_WORKSPACE_TILE_COLOR);
  const [inviteEmails, setInviteEmails] = useState("");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const logoPlaintextRef = useRef<Uint8Array | null>(null);
  const logoVaultKeyRef = useRef<Uint8Array | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [authStateId, setAuthStateId] = useState<string | null>(null);

  const [masterPassword, setMasterPassword] = useState("");
  const [repeatMasterPassword, setRepeatMasterPassword] = useState("");
  const masterPasswordRef = useRef("");
  const [recoverySecret, setRecoverySecret] = useState<string | null>(null);
  const [recoveryExported, setRecoveryExported] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const recoveryAckedRef = useRef(false);
  const recoveryAckInFlightRef = useRef<Promise<void> | null>(null);
  const recoveryCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [postRegAccessToken, setPostRegAccessToken] = useState<string | null>(null);
  const vaultKeyPendingEnrollRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await setupApi.getStatus();
        if (cancelled) {
          return;
        }
        setSetupRequired(status.required);
      } catch {
        if (!cancelled) {
          setSetupRequired(false);
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setupApi]);

  // Secrets/refs must not share a cleanup effect with logoPreviewUrl — changing the
  // preview (or Strict Mode remount) would wipe logoVaultKeyRef before finish upload.
  useEffect(() => {
    return () => {
      if (recoveryCopyResetTimeoutRef.current) {
        clearTimeout(recoveryCopyResetTimeoutRef.current);
      }
      if (vaultKeyPendingEnrollRef.current) {
        wipeBytes(vaultKeyPendingEnrollRef.current);
        vaultKeyPendingEnrollRef.current = null;
      }
      if (logoVaultKeyRef.current) {
        wipeBytes(logoVaultKeyRef.current);
        logoVaultKeyRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  function clearPendingLogo() {
    logoPlaintextRef.current = null;
    setLogoFileName(null);
    setLogoPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
  }

  function wipeLogoVaultKey() {
    if (logoVaultKeyRef.current) {
      wipeBytes(logoVaultKeyRef.current);
      logoVaultKeyRef.current = null;
    }
  }

  async function handleLogoFileSelected(file: File) {
    try {
      const plaintext = new Uint8Array(await file.arrayBuffer());
      assertWorkspaceLogoImage(plaintext);
      logoPlaintextRef.current = plaintext;
      setLogoFileName(file.name);
      setLogoPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return URL.createObjectURL(file);
      });
      setError(null);
    } catch {
      clearPendingLogo();
      setError(t("web.setupWizard.logoInvalid"));
    }
  }

  useEffect(() => {
    if (!testing) {
      setTestSecondsLeft(TEST_EMAIL_TIMEOUT_SECONDS);
      return;
    }
    setTestSecondsLeft(TEST_EMAIL_TIMEOUT_SECONDS);
    const intervalId = window.setInterval(() => {
      setTestSecondsLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [testing]);

  function applyMailSettings(settings: ServerMailSettingsResponseDto) {
    setSmtpHost(settings.smtp_host ?? "");
    setSmtpPort(settings.smtp_port == null ? "" : String(settings.smtp_port));
    setSmtpTlsMode(settings.smtp_tls_mode ?? "starttls");
    setSmtpUsername(settings.smtp_username ?? "");
    setEmailFrom(settings.email_from ?? "");
    setPasswordSet(settings.password_set);
    setSmtpActive(settings.smtp_active);
    if (settings.public_app_url) {
      setPublicAppUrl(settings.public_app_url);
    }
  }

  function mailPatch() {
    const trimmedPort = smtpPort.trim();
    const parsedPort = trimmedPort ? Number(trimmedPort) : null;
    return {
      smtp_host: smtpHost.trim(),
      smtp_port:
        trimmedPort && Number.isInteger(parsedPort) && parsedPort! >= 1 && parsedPort! <= 65535
          ? parsedPort
          : null,
      smtp_tls_mode: smtpTlsMode,
      smtp_username: smtpUsername.trim(),
      email_from: emailFrom.trim(),
      ...(smtpPassword.trim() ? { password: smtpPassword.trim() } : {}),
    };
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await setupApi.verifyCode(code.trim());
      setSetupToken(result.setup_token);
      const [mail, providerList, instance] = await Promise.all([
        setupApi.getMailSettings(result.setup_token),
        setupApi.listSmtpProviders(),
        setupApi.getInstance(result.setup_token),
      ]);
      applyMailSettings(mail);
      setProviders(providerList.providers);
      setPublicAppUrl(instance.public_app_url || mail.public_app_url || "");
      setRegistrationMode(instance.registration_mode);
      setStep("mail");
    } catch (err) {
      const mapped = messageFromError(err, "GENERIC");
      if (mapped === "SETUP_CODE_INVALID") {
        setError(t("auth.setup.errorInvalidCode"));
      } else if (mapped === "SETUP_CODE_LOCKED") {
        setError(t("auth.setup.errorLocked"));
      } else {
        setError(t("auth.setup.errorGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  function applyProvider(id: string) {
    setProviderId(id);
    const provider = providers.find((p) => p.id === id);
    if (!provider || id === "custom") {
      return;
    }
    setSmtpHost(provider.smtp_host);
    setSmtpPort(String(provider.smtp_port));
    setSmtpTlsMode(provider.smtp_tls_mode);
    if (provider.username_hint) {
      setSmtpUsername(provider.username_hint);
    }
  }

  async function handleTestEmail() {
    if (!setupToken || testing || busy) {
      return;
    }
    const recipient = testRecipient.trim() || ownerEmail.trim();
    if (!recipient) {
      setTestFailedMessage(t("web.setupWizard.mailRecipient"));
      return;
    }
    setTesting(true);
    setTestFailedMessage(null);
    let timedOut = false;
    let clientTimer: number | undefined;
    const request = setupApi.sendTestEmail(setupToken, {
      ...mailPatch(),
      recipient_email: recipient,
    });
    try {
      const updated = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          clientTimer = window.setTimeout(() => {
            timedOut = true;
            reject(new Error(t("web.workspaceSettings.serverMail.testTimeout")));
          }, TEST_EMAIL_CLIENT_TIMEOUT_MS);
        }),
      ]);
      applyMailSettings(updated);
      toast.success(t("web.workspaceSettings.serverMail.testSuccess"));
    } catch (err) {
      const message = timedOut
        ? t("web.workspaceSettings.serverMail.testTimeout")
        : messageFromError(err, t("web.workspaceSettings.serverMail.testError"));
      setTestFailedMessage(message === "GENERIC" ? t("web.workspaceSettings.serverMail.testError") : message);
      if (timedOut) {
        void request.catch(() => undefined);
      }
    } finally {
      if (clientTimer !== undefined) {
        window.clearTimeout(clientTimer);
      }
      setTesting(false);
    }
  }

  async function handleSkipMail() {
    if (!setupToken) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await setupApi.skipMail(setupToken);
      applyMailSettings(updated);
      setStep("server");
    } catch {
      setError(t("auth.setup.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleMailContinue() {
    if (!setupToken) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!smtpActive) {
        await setupApi.updateMailSettings(setupToken, mailPatch());
      }
      setStep("server");
    } catch {
      setError(t("auth.setup.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleServerContinue(e: FormEvent) {
    e.preventDefault();
    if (!setupToken) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setupApi.updateInstance(setupToken, {
        public_app_url: publicAppUrl.trim(),
        registration_mode: registrationMode,
      });
      setStep("owner");
    } catch {
      setError(t("auth.setup.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleOwnerContinue(e: FormEvent) {
    e.preventDefault();
    if (!setupToken) {
      return;
    }
    const email = ownerEmail.trim();
    if (!email || !workspaceName.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const begun = await setupApi.beginRegistration(setupToken, email);
      setAuthStateId(begun.auth_state_id);
      setRegistrationAuthStateId(begun.auth_state_id);
      updateLocalProfile({
        email: begun.email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (!testRecipient.trim()) {
        setTestRecipient(begun.email);
      }
      if (begun.already_registered) {
        // Incomplete setup rebound: recovery already exported — jump to finish.
        setRecoveryExported(true);
        setRecoverySecret(null);
        setStep("recovery");
        return;
      }
      setStep("password");
    } catch {
      setError(t("auth.setup.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function enrollAccountRecoveryKey(vaultKey: Uint8Array, token: string): Promise<string> {
    const secret = await generateRecoverySecret();
    const secretBytes = new TextEncoder().encode(secret);
    const encryptedBlob = await wrapVaultKeyWithRecoverySecret(vaultKey, secretBytes);
    const possessionPublicKey = await recoveryPossessionPublicKey(secretBytes);
    wipeBytes(secretBytes);
    const core = createAuthenticatedCoreClient(token);
    await core.enrollAccountRecoveryKey({ encryptedBlob, possessionPublicKey });
    return secret;
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!authStateId || busy) {
      return;
    }
    if (masterPassword !== repeatMasterPassword) {
      setError(t("auth.registration.reqPasswordsMatch"));
      return;
    }
    if (!masterPasswordMeetsNewPasswordPolicy(masterPassword)) {
      setError(t("auth.registration.reqPasswordLength", { min: MIN_MASTER_PASSWORD_LENGTH }));
      return;
    }
    setBusy(true);
    setError(null);
    const pwd = new TextEncoder().encode(masterPassword);
    masterPasswordRef.current = masterPassword;
    try {
      await initCrypto();
      const material = await buildRegistrationCryptoArtifacts(pwd);
      const wire = registrationArtifactsToWire(material);
      saveVaultBundle({
        server_key_share_b64: wire.server_key_share,
        device_share_b64: bytesToBase64(material.wrappedDeviceShare),
        password_kdf_salt_b64: wire.password_kdf_salt,
        password_kdf_params_version: wire.password_kdf_params_version,
        encrypted_private_key: wire.encrypted_private_key,
      });
      await persistSplitKeyShareWrapKey("pending", material.shareWrap);
      const devicePublicKeyB64 = await ensureDeviceSigningPublicKey();
      let loginKeyB64: string | undefined;
      const email = ownerEmail.trim();
      if (email) {
        const loginKey = await deriveLoginKey({
          masterPasswordUtf8: pwd,
          email,
        });
        try {
          loginKeyB64 = bytesToBase64(loginKey);
        } finally {
          wipeBytes(loginKey);
        }
      }
      const personalWorkspaceName = workspaceName.trim() || t("auth.registration.personalWorkspaceName");
      const personalVaultName = t("web.workspaceSettings.vaults.personal.title");
      const browserEnv = parseBrowserEnvironment(navigator.userAgent ?? "");
      const body: RegisterCompleteRequestDto = {
        auth_state_id: authStateId,
        user_public_key: wire.user_public_key,
        user_public_pq_key: wire.user_public_pq_key,
        user_public_mldsa_key: wire.user_public_mldsa_key,
        encrypted_private_key: wire.encrypted_private_key,
        server_key_share: wire.server_key_share,
        password_kdf_salt: wire.password_kdf_salt,
        password_kdf_params_version: wire.password_kdf_params_version,
        master_password_policy_version: MASTER_PASSWORD_POLICY_VERSION,
        device_public_key: devicePublicKeyB64,
        device_share: bytesToBase64(material.wrappedDeviceShare),
        device_fingerprint: getOrCreateDeviceFingerprint(),
        device_name: browserEnv.deviceName,
        personal_workspace_name: personalWorkspaceName,
        personal_vault_name: personalVaultName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ...(loginKeyB64 ? { login_key: loginKeyB64 } : {}),
        platform: browserEnv.platform,
        os_name: browserEnv.osName,
        os_version: browserEnv.osVersion,
        app_version: "web",
        client_type: browserEnv.clientType,
        user_agent: browserEnv.userAgent,
        metadata: { crypto_capable: true },
      };
      const reg = await authClient.completeRegistration(body);
      if (!reg.access_token?.trim()) {
        throw new Error("registration bootstrap token missing");
      }
      setPostRegAccessToken(reg.access_token);
      finalizePendingVaultBundle(reg.user_id);
      await persistSplitKeyShareWrapKey(reg.user_id, material.shareWrap);
      await clearSplitKeyShareWrapKey("pending");
      clearEmailLoginFlow();
      writeLastLoginMethodHint({ email, primary: "email" });
      vaultKeyPendingEnrollRef.current = material.vaultKey;
      if (logoPlaintextRef.current) {
        if (logoVaultKeyRef.current) {
          wipeBytes(logoVaultKeyRef.current);
        }
        // Keep a copy for optional logo upload after finish issues a full session.
        logoVaultKeyRef.current = material.vaultKey.slice();
      }
      wipeBytes(pwd);
      wipeBytes(material.serverKeyShare);
      wipeBytes(material.deviceShare);
      wipeBytes(material.shareWrap.ed25519Seed);
      wipeBytes(material.shareWrap.mlkemDecapsulationKey);
      try {
        const secret = await enrollAccountRecoveryKey(material.vaultKey, reg.access_token);
        wipeBytes(material.vaultKey);
        vaultKeyPendingEnrollRef.current = null;
        setRecoverySecret(secret);
        setStep(registrationStepAfterRecoveryEnroll(true) === "recoveryKey" ? "recovery" : "recovery");
      } catch {
        setError(t("auth.registration.recovery.errorEnroll"));
        setStep("recovery");
      }
    } catch (err) {
      wipeBytes(pwd);
      if (import.meta.env.DEV) {
        console.error("[setup/register]", err);
      }
      setError(t("auth.registration.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function ackRecoveryKeyExport(): Promise<void> {
    if (recoveryAckedRef.current || recoveryExported) {
      return;
    }
    if (recoveryAckInFlightRef.current) {
      return recoveryAckInFlightRef.current;
    }
    const token = postRegAccessToken;
    if (!token) {
      throw new Error("missing access token for recovery key export ack");
    }
    const run = (async () => {
      const core = createAuthenticatedCoreClient(token);
      await core.ackAccountRecoveryKeyExport();
      recoveryAckedRef.current = true;
    })();
    recoveryAckInFlightRef.current = run;
    try {
      await run;
    } finally {
      recoveryAckInFlightRef.current = null;
    }
  }

  async function handleRecoveryCopy() {
    if (!recoverySecret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(recoverySecret);
      await ackRecoveryKeyExport();
      setRecoveryExported(true);
      setRecoveryCopied(true);
      if (recoveryCopyResetTimeoutRef.current) {
        clearTimeout(recoveryCopyResetTimeoutRef.current);
      }
      recoveryCopyResetTimeoutRef.current = setTimeout(() => {
        setRecoveryCopied(false);
        recoveryCopyResetTimeoutRef.current = null;
      }, RECOVERY_COPY_SUCCESS_MS);
      toast.success(t("web.keyForm.copied"));
    } catch {
      setError(t("web.settingsPopup.recovery.error.copyFailed"));
    }
  }

  async function handleRecoveryDownload() {
    if (!recoverySecret) {
      return;
    }
    const toastId = toast.loading(t("web.settingsPopup.recovery.key.creatingPdf"));
    try {
      await downloadRecoveryKeyPdf(recoverySecret, {
        title: t("auth.registration.recovery.pdfTitle"),
        description: t("auth.registration.recovery.pdfDescription"),
      });
      await ackRecoveryKeyExport();
      setRecoveryExported(true);
    } catch {
      setError(t("web.settingsPopup.recovery.error.generic"));
    } finally {
      toast.dismiss(toastId);
    }
  }

  async function handleFinish() {
    if (!setupToken || !recoveryExported || busy) {
      return;
    }
    setBusy(true);
    setStep("finishing");
    setError(null);
    try {
      const invitations = inviteEmails
        .split(/[\n,;]+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((email) => ({ email, role_builtin_id: "user" as const }));
      const finished = await setupApi.finish(setupToken, {
        workspace_name: workspaceName.trim(),
        tile_color: tileColor,
        invitations,
        // Leave personal-data bootstrap for the first-sign-in product tour.
        dismiss_personal_data_bootstrap: false,
      });
      flushSync(() => {
        applyAccessTokenResponse({
          access_token: finished.access_token,
          expires_at: finished.expires_at,
          user_id: finished.user_id,
          token_type: "Bearer",
        });
      });
      writeStoredCurrentWorkspaceId(finished.user_id, finished.workspace_id);
      setRegistrationAuthStateId(null);
      setPostRegAccessToken(null);
      const unlock = await tryUnlockWithMasterPassword(masterPasswordRef.current);
      masterPasswordRef.current = "";
      setMasterPassword("");
      setRepeatMasterPassword("");
      const hadPendingLogo = Boolean(logoPlaintextRef.current);
      const logoDecision = setupLogoUploadDecision({
        hadPendingLogo,
        unlockOk: unlock.ok,
        hasVaultKey: Boolean(logoVaultKeyRef.current),
        hasPlaintext: Boolean(logoPlaintextRef.current),
      });
      const logoOutcome = await runSetupLogoUpload({
        decision: logoDecision,
        vaultKey: logoVaultKeyRef.current,
        plaintext: logoPlaintextRef.current,
        upload: async (vaultKey, plaintext) => {
          const { encryptWorkspaceLogo } = await import("../../workspace/workspaceKeyClient");
          const core = createAuthenticatedCoreClient(finished.access_token);
          const ciphertext = await encryptWorkspaceLogo({
            core,
            workspaceId: finished.workspace_id,
            vaultKey,
            userId: finished.user_id,
            plaintext,
          });
          await commitWorkspaceLogoReplacement({
            ciphertext,
            putCiphertext: async (body) => {
              await core.putWorkspaceLogo(finished.workspace_id, body);
            },
            deleteLegacy: null,
          });
        },
      });
      wipeLogoVaultKey();
      clearPendingLogo();
      if (logoOutcome === "failed") {
        toast.error(t("web.setupWizard.logoUploadFailed"));
      }
      if (!unlock.ok) {
        navigate(`${ITEMS_PATH}?${WORKSPACE_QUERY_PARAM}=${encodeURIComponent(finished.workspace_id)}`, {
          replace: true,
        });
        return;
      }
      navigate(`${ITEMS_PATH}?${WORKSPACE_QUERY_PARAM}=${encodeURIComponent(finished.workspace_id)}`, {
        replace: true,
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[setup/finish]", err);
      }
      setError(t("auth.setup.errorGeneric"));
      setStep("recovery");
    } finally {
      setBusy(false);
    }
  }

  if (statusLoading) {
    return (
      <AppShellLayout title={t("auth.setup.title")} busy>
        <Spinner aria-label={t("auth.setup.redirecting")} />
      </AppShellLayout>
    );
  }

  if (!setupRequired && step === "code") {
    return <Navigate to={AUTH_EMAIL_PATH} replace />;
  }

  const title =
    step === "mail"
      ? t("web.setupWizard.mailTitle")
      : step === "server"
        ? t("web.setupWizard.serverTitle")
        : step === "owner"
          ? t("web.setupWizard.ownerTitle")
          : step === "password"
            ? t("web.setupWizard.passwordTitle")
            : step === "recovery" || step === "finishing"
              ? t("auth.registration.recovery.title")
              : t("auth.setup.title");

  const description =
    step === "mail"
      ? t("web.setupWizard.mailDescription")
      : step === "server"
        ? t("web.setupWizard.serverDescription")
        : step === "owner"
          ? t("web.setupWizard.ownerDescription")
          : step === "password"
            ? t("web.setupWizard.passwordDescription")
            : step === "code"
              ? t("auth.setup.description")
              : undefined;

  if (step === "finishing") {
    return (
      <AppShellLayout title={title} busy>
        <Spinner aria-label={t("auth.registration.recovery.preparing")} />
      </AppShellLayout>
    );
  }

  return (
    <AppShellLayout
      title={title}
      description={description}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      {error ? (
        <Alert variant="error" className="mb-4">
          <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === "code" ? (
        <form onSubmit={handleVerifyCode} className="flex w-full flex-col gap-6" noValidate>
          <div className="flex flex-col gap-3">
            <label htmlFor="setup-code" className="okkey-small font-medium text-copy-primary">
              {t("auth.setup.codeLabel")}
            </label>
            <Input
              id="setup-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              autoFocus
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || !code.trim()}>
            {t("auth.setup.submitCode")}
          </Button>
        </form>
      ) : null}

      {step === "mail" ? (
        <div className="flex w-full flex-col gap-6" data-testid="setup-mail-step">
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.setupWizard.mailProvider")}</span>
            <Select value={providerId} onValueChange={applyProvider} disabled={busy || testing}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {t(`web.setupWizard.provider.${p.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.workspaceSettings.serverMail.smtpHost")}</span>
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} disabled={busy || testing} />
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.workspaceSettings.serverMail.smtpPort")}</span>
            <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} disabled={busy || testing} />
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.workspaceSettings.serverMail.tlsMode")}</span>
            <Select
              value={smtpTlsMode}
              onValueChange={(v) => setSmtpTlsMode(v as SmtpTlsMode)}
              disabled={busy || testing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TLS_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`web.workspaceSettings.serverMail.tls.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.workspaceSettings.serverMail.username")}</span>
            <Input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} disabled={busy || testing} />
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.workspaceSettings.serverMail.password")}</span>
            <Input
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder={passwordSet ? "••••••••" : undefined}
              disabled={busy || testing}
              autoComplete="new-password"
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.workspaceSettings.serverMail.emailFrom")}</span>
            <Input value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} disabled={busy || testing} />
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.setupWizard.mailRecipient")}</span>
            <Input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              disabled={busy || testing}
            />
          </div>
          {testFailedMessage ? (
            <Alert variant="error">
              <AlertDescription>{testFailedMessage}</AlertDescription>
            </Alert>
          ) : null}
          {smtpActive ? (
            <Alert variant="info">
              <AlertDescription>{t("web.workspaceSettings.serverMail.statusActive")}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void handleTestEmail()} disabled={busy || testing}>
              {testing
                ? t("web.workspaceSettings.serverMail.testingCountdown", { seconds: testSecondsLeft })
                : t("web.setupWizard.mailTest")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleSkipMail()} disabled={busy || testing}>
              {t("web.setupWizard.mailSkip")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void handleMailContinue()} disabled={busy || testing}>
              {t("web.setupWizard.mailNext")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "server" ? (
        <form onSubmit={handleServerContinue} className="flex w-full flex-col gap-6">
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.setupWizard.publicAppUrl")}</span>
            <Input
              value={publicAppUrl}
              onChange={(e) => setPublicAppUrl(e.target.value)}
              placeholder="https://vault.example.com"
              disabled={busy}
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.setupWizard.registrationMode")}</span>
            <Select
              value={registrationMode}
              onValueChange={(v) => setRegistrationMode(v as "open" | "invite_only")}
              disabled={busy}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("web.setupWizard.registrationOpen")}</SelectItem>
                <SelectItem value="invite_only">{t("web.setupWizard.registrationInviteOnly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy}>
            {t("web.setupWizard.ownerNext")}
          </Button>
        </form>
      ) : null}

      {step === "owner" ? (
        <form onSubmit={handleOwnerContinue} className="flex w-full flex-col gap-6">
          <div className="flex w-full flex-col gap-2">
            <label htmlFor="setup-owner-email" className="okkey-small font-medium text-copy-primary">
              {t("web.setupWizard.ownerEmail")}
            </label>
            <Input
              id="setup-owner-email"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
              disabled={busy}
              autoComplete="email"
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <label htmlFor="setup-first-name" className="okkey-small font-medium text-copy-primary">
              {t("web.setupWizard.firstName")}
            </label>
            <Input
              id="setup-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <label htmlFor="setup-last-name" className="okkey-small font-medium text-copy-primary">
              {t("web.setupWizard.lastName")}
            </label>
            <Input
              id="setup-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <label htmlFor="setup-workspace-name" className="okkey-small font-medium text-copy-primary">
              {t("web.setupWizard.workspaceName")}
            </label>
            <Input
              id="setup-workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.setupWizard.workspaceColor")}</span>
            <WorkspaceTileColorPicker value={tileColor} t={t} onChange={setTileColor} disabled={busy} />
          </div>
          <div className="flex w-full flex-col gap-3">
            <span className="okkey-small font-medium text-copy-primary">{t("web.setupWizard.workspaceLogo")}</span>
            <div className="flex flex-wrap items-center gap-4">
              <WorkspaceLogoTile
                className="size-[60px] shrink-0"
                tileColor={tileColor}
                hasCustomLogo={Boolean(logoPreviewUrl)}
                imageSrc={logoPreviewUrl ?? undefined}
                loading={false}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                      void handleLogoFileSelected(file);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-1.5 px-3"
                  disabled={busy}
                  onClick={() => logoFileInputRef.current?.click()}
                >
                  <UploadIcon />
                  {logoPreviewUrl
                    ? t("web.workspaceSettings.general.replaceLogo")
                    : t("web.workspaceSettings.general.uploadLogo")}
                </Button>
                {logoPreviewUrl ? (
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => clearPendingLogo()}>
                    {t("web.setupWizard.logoRemove")}
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-sm text-copy-secondary">
              {logoFileName
                ? t("web.setupWizard.logoSelected", { name: logoFileName })
                : t("web.setupWizard.logoHint")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="okkey-small font-medium text-copy-primary">{t("web.setupWizard.invitesLabel")}</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              placeholder={t("web.setupWizard.invitesHint")}
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || !ownerEmail.trim() || !workspaceName.trim()}>
            {t("web.setupWizard.ownerNext")}
          </Button>
        </form>
      ) : null}

      {step === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="flex w-full flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label htmlFor="setup-master-password" className="okkey-small font-medium text-copy-primary">
              {t("auth.registration.masterPassword")}
            </label>
            <Input
              id="setup-master-password"
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
            <ul className="flex flex-col gap-1 text-sm text-copy-secondary">
              <li className="flex items-center gap-2">
                {masterPassword.length >= MIN_MASTER_PASSWORD_LENGTH ? (
                  <RequirementCheckIcon className="size-4 text-green-600" />
                ) : (
                  <RequirementCrossIcon className="size-4 text-destructive" />
                )}
                {t("auth.registration.reqPasswordLength", { min: MIN_MASTER_PASSWORD_LENGTH })}
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <label htmlFor="setup-repeat-master-password" className="okkey-small font-medium text-copy-primary">
              {t("auth.registration.repeatMasterPassword")}
            </label>
            <Input
              id="setup-repeat-master-password"
              type="password"
              value={repeatMasterPassword}
              onChange={(e) => setRepeatMasterPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
          <Button
            type="submit"
            disabled={
              busy ||
              !masterPassword ||
              !repeatMasterPassword ||
              !masterPasswordMeetsNewPasswordPolicy(masterPassword) ||
              masterPassword !== repeatMasterPassword
            }
          >
            {t("auth.registration.submit")}
          </Button>
        </form>
      ) : null}

      {step === "recovery" && recoverySecret ? (
        <div className="flex w-full flex-col gap-6">
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
            <RecoveryInfoTriangleIcon className="mt-0.5 size-5 shrink-0" />
            <p className="text-sm text-copy-secondary">{t("auth.registration.recovery.description")}</p>
          </div>
          <p className="break-all font-mono text-sm text-copy-primary">{recoverySecret}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => void handleRecoveryCopy()}>
              {recoveryCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {recoveryCopied ? t("web.keyForm.copied") : t("auth.registration.recovery.copy")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleRecoveryDownload()}>
              <Download className="size-4" />
              {t("auth.registration.recovery.downloadPdf")}
            </Button>
          </div>
          <Button type="button" disabled={!recoveryExported || busy} onClick={() => void handleFinish()}>
            {t("web.setupWizard.finish")}
          </Button>
        </div>
      ) : null}

      {step === "recovery" && !recoverySecret && recoveryExported ? (
        <div className="flex w-full flex-col gap-6">
          <p className="text-sm text-copy-secondary">{t("web.setupWizard.resumeFinishHint")}</p>
          <Button type="button" disabled={busy} onClick={() => void handleFinish()}>
            {t("web.setupWizard.finish")}
          </Button>
        </div>
      ) : null}
    </AppShellLayout>
  );
}
