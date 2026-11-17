export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export function ensure(condition, message, status = 400) {
  if (!condition) throw new ApiError(status, message);
}
