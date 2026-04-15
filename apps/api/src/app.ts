import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import healthRouter from './routes/health';
import meRouter from './routes/me';
import schoolsRouter from './routes/schools';
import recommendationsRouter from './routes/recommendations';
import reviewsRouter from './routes/reviews';
import adminRouter from './routes/admin';
import onemapRouter from './routes/onemap';
import bootstrapRouter from './routes/bootstrap';

export function createApp() {
  const app = express();

  // Security & parsing middleware
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? '*',
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Routes
  app.use('/health', healthRouter);
  app.use('/me', meRouter);
  app.use('/schools', schoolsRouter);
  app.use('/recommendations', recommendationsRouter);
  app.use('/reviews', reviewsRouter);
  app.use('/admin', adminRouter);
  app.use('/onemap', onemapRouter);
  app.use('/bootstrap-admin', bootstrapRouter);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  });

  return app;
}
