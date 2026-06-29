import { toast } from "sonner";

export type SaveToastMessages = {
  loading: string;
  success: string;
  error: string;
};

export function formatSaveError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export async function runSaveWithToast<T>(messages: SaveToastMessages, action: () => Promise<T>): Promise<T> {
  return toast
    .promise(action(), {
      loading: messages.loading,
      success: messages.success,
      error: (error) => formatSaveError(error, messages.error),
    })
    .unwrap();
}
