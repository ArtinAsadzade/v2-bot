export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  public constructor(message: string, code = 'APP_ERROR', statusCode = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationAppError extends AppError {
  public constructor(details: unknown) {
    super('Validation failed', 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends AppError {
  public constructor(entity: string) {
    super(`${entity} was not found`, 'NOT_FOUND', 404);
  }
}
