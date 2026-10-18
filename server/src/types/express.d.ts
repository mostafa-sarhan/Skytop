import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: import('../types').AuthUser;
    fileValidationError?: string;
  }
}
