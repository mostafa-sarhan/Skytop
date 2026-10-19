import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: import('../types').AuthUser;
    /** Request ID (see middlewares/requestContext). */
    id?: string;
    fileValidationError?: string;
  }
}
