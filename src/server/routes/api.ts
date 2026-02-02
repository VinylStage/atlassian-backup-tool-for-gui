import { Router } from 'express';
import { createSpacesRouter } from './spaces.js';
import { createPagesRouter } from './pages.js';
import { createBackupRouter } from './backup.js';

export function createApiRouter(): Router {
  const router = Router();

  router.use('/spaces', createSpacesRouter());
  router.use('/pages', createPagesRouter());
  router.use('/backup', createBackupRouter());

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return router;
}
