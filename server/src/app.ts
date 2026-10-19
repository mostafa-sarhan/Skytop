import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { rateLimit } from './middlewares/rateLimit';
import { requestContext } from './middlewares/requestContext';

export const createApp = (): Application => {
  const app = express();

  // Client IP for rate limits / logs: only the configured proxy (Nginx on
  // loopback in production) may set X-Forwarded-For. Never "trust all".
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use(requestContext);
  app.use(
    helmet({
      // Private files are only ever loaded by this same site.
      crossOriginResourcePolicy: { policy: 'same-origin' },
      // HTTPS / HSTS are owned by Nginx (it sees every response, static too).
      hsts: false,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 100 }));

  // API responses are per-user data: never stored by browsers or proxies.
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', rateLimit);
  app.use('/api/v1', routes);

  if (env.SERVE_CLIENT_DIR) serveClient(app, path.resolve(env.SERVE_CLIENT_DIR));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

/**
 * Optional: serve the built client from this process (local production
 * rehearsal). In production Nginx serves client/dist with the same rules:
 * hashed assets cached for a year, index.html never cached, SPA fallback.
 */
const serveClient = (app: Application, clientDist: string) => {
  app.use(
    '/assets',
    express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '365d', fallthrough: false }),
  );
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
};
