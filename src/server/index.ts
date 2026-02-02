import express from 'express';
import path from 'path';
import { config, validateConfig } from './config.js';
import { createApiRouter } from './routes/api.js';
import { setupLogger } from './utils/logger.js';

const logger = setupLogger('server');

async function startServer() {
  validateConfig();

  const app = express();

  app.use(express.json());

  app.use('/api', createApiRouter());

  if (config.isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: path.resolve(process.cwd(), 'src/client'),
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(config.clientDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.clientDir, 'index.html'));
    });
  }

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  );

  app.listen(config.port, () => {
    logger.info(`Server running at http://localhost:${config.port}`);
    if (config.isDev) {
      logger.info('Development mode with Vite HMR enabled');
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
