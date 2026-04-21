import 'dotenv/config';

import express, { Request, Response } from 'express';
import multer from 'multer';
import { MediaTransformer } from './media-transformer';
import { TransformQuerySchema, PresetSchema } from './validation';
import { Logger } from '@t3ck/shared';
import { TransformOptions } from './types';

const logger = new Logger('media-service');

const app: express.Application = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const transformer = new MediaTransformer();

app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'media-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'media-service',
    status: 'running',
    endpoints: {
      health: '/health',
      transform: '/transform',
      upload: '/upload',
      presets: '/presets',
    },
  });
});

// Transform image from URL
app.get('/transform', async (req: Request, res: Response) => {
  try {
    const parsed = TransformQuerySchema.parse(req.query);

    const options: TransformOptions = {
      width: parsed.w,
      height: parsed.h,
      fit: parsed.fit,
      format: parsed.format,
      quality: parsed.quality,
      blur: parsed.blur,
      grayscale: parsed.grayscale,
      sharpen: parsed.sharpen,
    };

    const result = await transformer.transformFromUrl(parsed.url, options);

    res.set('Content-Type', result.contentType);
    res.set('X-Image-Width', result.width.toString());
    res.set('X-Image-Height', result.height.toString());
    res.set('X-Image-Size', result.size.toString());
    res.set('Cache-Control', 'public, max-age=31536000, immutable');

    res.send(result.buffer);
  } catch (error: any) {
    logger.error('Transform error', { error: error.message, query: req.query });
    res.status(400).json({ error: error.message });
  }
});

// Transform uploaded image
app.post('/upload', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const options: TransformOptions = {
      width: req.body.width ? parseInt(req.body.width, 10) : undefined,
      height: req.body.height ? parseInt(req.body.height, 10) : undefined,
      fit: req.body.fit,
      format: req.body.format || 'webp',
      quality: req.body.quality ? parseInt(req.body.quality, 10) : 85,
      blur: req.body.blur ? parseFloat(req.body.blur) : undefined,
      grayscale: req.body.grayscale === 'true',
      sharpen: req.body.sharpen === 'true',
    };

    const result = await transformer.transformBuffer(req.file.buffer, options);

    res.set('Content-Type', result.contentType);
    res.set('X-Image-Width', result.width.toString());
    res.set('X-Image-Height', result.height.toString());
    res.set('X-Original-Size', req.file.size.toString());
    res.set('X-Transformed-Size', result.size.toString());

    return res.send(result.buffer);
  } catch (error: any) {
    logger.error('Upload transform error', { error: error.message });
    return res.status(400).json({ error: error.message });
  }
});

// Transform with preset
app.get('/preset/:preset', async (req: Request, res: Response) => {
  try {
    const { preset } = req.params;
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    const result = await transformer.transformWithPreset(url, preset);

    res.set('Content-Type', result.contentType);
    res.set('X-Preset', preset);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');

    return res.send(result.buffer);
  } catch (error: any) {
    logger.error('Preset transform error', { error: error.message, preset: req.params.preset });
    return res.status(400).json({ error: error.message });
  }
});

// Get all presets
app.get('/presets', (_req: Request, res: Response) => {
  res.json({ presets: transformer.getPresets() });
});

// Add custom preset
app.post('/presets', (req: Request, res: Response) => {
  try {
    const preset = PresetSchema.parse(req.body);
    transformer.addPreset(preset);
    res.json({ message: 'Preset added', preset });
  } catch (error: any) {
    logger.error('Add preset error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Get stats
app.get('/stats', (_req: Request, res: Response) => {
  res.json({ stats: transformer.getStats() });
});

// Clear cache
app.post('/cache/clear', (_req: Request, res: Response) => {
  transformer.clearCache();
  res.json({ message: 'Cache cleared' });
});

const PORT = process.env.PORT || process.env.MEDIA_SERVICE_PORT || 3007;

app.listen(PORT, () => {
  logger.info(`Media Service running on port ${PORT}`);
  logger.info('Presets loaded', { count: transformer.getPresets().length });
});

export default app;
