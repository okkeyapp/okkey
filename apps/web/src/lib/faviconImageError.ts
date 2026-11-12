/** Thrown when fetched or uploaded icon bytes cannot be normalized to a square PNG. */
export class FaviconImageNormalizeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "FaviconImageNormalizeError";
    this.code = code;
  }
}

export function isFaviconImageNormalizeError(error: unknown): boolean {
  return (
    error instanceof FaviconImageNormalizeError ||
    (error instanceof Error && error.name === "FaviconImageNormalizeError")
  );
}
