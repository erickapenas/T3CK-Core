import express, { Request, Response } from 'express';
import { ProvisioningFormService, ProvisioningStatus } from './provisioning-form';
import { Logger } from '@t3ck/shared';

const app = express();
app.use(express.json());

const provisioningService = new ProvisioningFormService();
const logger = new Logger('tenant-service');

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Submeter formulário de provisionamento
app.post('/provisioning/submit', async (req: Request, res: Response) => {
  try {
    const form = req.body;

    // Validar formulário
    provisioningService.validateForm(form);

    // Criar tenant com status PENDING
    const tenant = provisioningService.createTenant(form);

    // Aqui normalmente salvaria no banco de dados
    // Por enquanto apenas log
    logger.info('Provisioning form submitted', {
      tenantId: tenant.id,
      domain: form.domain,
    });

    res.status(201).json({
      success: true,
      data: tenant,
      message: 'Form submitted successfully. Provisioning will begin shortly.',
    });
  } catch (error) {
    logger.error('Failed to submit provisioning form', { error });
    
    if (error instanceof Error && error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to submit provisioning form',
    });
  }
});

// Obter status do provisionamento
app.get('/provisioning/:tenantId/status', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    // Aqui normalmente buscaria do banco de dados
    // Por enquanto retorna mock
    res.json({
      tenantId,
      status: ProvisioningStatus.PENDING,
      message: 'Provisioning in queue',
    });
  } catch (error) {
    logger.error('Failed to get provisioning status', { error });
    res.status(500).json({ error: 'Failed to get provisioning status' });
  }
});

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  logger.info(`Tenant service running on port ${PORT}`);
});
