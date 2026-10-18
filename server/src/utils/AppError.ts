export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'غير مصرح لك بالدخول', details?: unknown) {
    return new AppError(401, message, 'UNAUTHORIZED', details);
  }

  static forbidden(message = 'ليس لديك صلاحية لتنفيذ هذا الإجراء', details?: unknown) {
    return new AppError(403, message, 'FORBIDDEN', details);
  }

  static notFound(message = 'السجل المطلوب غير موجود', details?: unknown) {
    return new AppError(404, message, 'NOT_FOUND', details);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(409, message, 'CONFLICT', details);
  }

  static unprocessable(message: string, details?: unknown) {
    return new AppError(422, message, 'UNPROCESSABLE', details);
  }

  static internal(message = 'حدث خطأ غير متوقع في الخادم', details?: unknown) {
    return new AppError(500, message, 'INTERNAL', details);
  }
}
