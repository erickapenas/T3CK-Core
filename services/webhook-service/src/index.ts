import express from 'express';
import routes from './api/routes';
import { Logger } from '@t3ck/shared';
import { setupHealthChecks } from './health';

const app = express();
app.use(express.json());

const logger = new Logger('webhook-service');

// Health checks setup
setupHealthChecks(app);

app.use('/api', routes);

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  logger.info(`Webhook service running on port ${PORT}`);
});
