/**
 * PDF download for a single recovery key (reuses backup-codes PDF layout).
 */
import { downloadBackupCodesPdf, type BackupCodesPdfCopy } from "./backupCodesPdf";

export async function downloadRecoveryKeyPdf(
  recoveryKey: string,
  copy: BackupCodesPdfCopy,
  fileName = "okkey-recovery-key.pdf",
): Promise<void> {
  await downloadBackupCodesPdf([recoveryKey], copy, fileName);
}
