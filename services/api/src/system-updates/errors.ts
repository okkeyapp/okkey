/** Typed failure for self-host system updates. License state is never a cause. */
export class SystemUpdateError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "SystemUpdateError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isSystemUpdateError(error: unknown): error is SystemUpdateError {
  return error instanceof SystemUpdateError;
}
