export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export class StorageConnectionError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = "StorageConnectionError";
  }
}

export class StorageQueryError extends StorageError {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "StorageQueryError";
    this.details = details;
  }
}

export class EntityNotFoundError extends StorageError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "EntityNotFoundError";
  }
}

export class UniqueConstraintError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = "UniqueConstraintError";
  }
}

export class VersionConflictError extends StorageError {
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(expectedVersion: number, actualVersion: number) {
    super(
      `event version conflict: expected ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = "VersionConflictError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}
