export interface FieldError {
  path?: string;
  message: string;
}

export class ApiError extends Error {
  statusCode: number;
  errors: FieldError[];

  constructor(statusCode: number, message: string, errors: FieldError[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}