import express from 'express';
import routes from './api/routes';
import { Logger } from '@t3ck/shared';

const app = express();
app.use(express.json());

const logger = new Logger('webhook-service');

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  logger.info(`Webhook service running on port ${PORT}`);
});
