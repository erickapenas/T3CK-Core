import sharp from 'sharp';
import axios from 'axios';
import { TransformOptions, TransformResponse, CacheEntry, PresetConfig } from './types';
import { Logger } from '@t3ck/shared';

const logger = new Logger('media-transformer');

export class MediaTransformer {
  private cache = new Map<string, CacheEntry>();
  private readonly maxCacheSize = 100; // MB
  private readonly maxCacheAge = 3600000; // 1 hour
  private stats = {
    transformations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalProcessingTime: 0,
    totalBytesSaved: 0,
  };

  private presets: Map<string, PresetConfig> = new Map([
    ['thumbnail', { name: 'thumbnail', width: 150, height: 150, format: 'webp', quality: 80 }],
    ['small', { name: 'small', width: 320, format: 'webp', quality: 85 }],
    ['medium', { name: 'medium', width: 640, format: 'webp', quality: 85 }],
    ['large', { name: 'large', width: 1024, format: 'webp', quality: 90 }],
    ['xlarge', { name: 'xlarge', width: 1920, format: 'webp', quality: 90 }],
    ['avif-small', { name: 'avif-small', width: 640, format: 'avif', quality: 75 }],
    ['avif-medium', { name: 'avif-medium', width: 1024, format: 'avif', quality: 80 }],
  ]);

  async transformFromUrl(url: string, options: TransformOptions): Promise<TransformResponse> {
    const cacheKey = this.getCacheKey(url, options);

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      logger.debug('Cache hit for image', { url, cacheKey });
      return {
        buffer: cached.buffer,
        contentType: cached.contentType,
        size: cached.size,
        format: options.format || 'webp',
        width: options.width || 0,
        height: options.height || 0,
      };
    }

    this.stats.cacheMisses++;

    // Download image
    const startTime = Date.now();
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Transform
    const result = await this.transformBuffer(buffer, options);

    // Update stats
    const processingTime = Date.now() - startTime;
    this.stats.transformations++;
    this.stats.totalProcessingTime += processingTime;
    this.stats.totalBytesSaved += buffer.length - result.size;

    // Cache result
    this.addToCache(cacheKey, {
      buffer: result.buffer,
      contentType: result.contentType,
      timestamp: Date.now(),
      size: result.size,
    });

    logger.info('Image transformed', {
      url,
      originalSize: buffer.length,
      transformedSize: result.size,
      savings: `${(((buffer.length - result.size) / buffer.length) * 100).toFixed(1)}%`,
      processingTime: `${processingTime}ms`,
    });

    return result;
  }

  async transformBuffer(buffer: Buffer, options: TransformOptions): Promise<TransformResponse> {
    let pipeline = sharp(buffer);

    // Resize
    if (options.width || options.height) {
      pipeline = pipeline.resize(options.width, options.height, {
        fit: options.fit || 'cover',
        withoutEnlargement: true,
      });
    }

    // Effects
    if (options.blur) {
      pipeline = pipeline.blur(options.blur);
    }

    if (options.grayscale) {
      pipeline = pipeline.grayscale();
    }

    if (options.sharpen) {
      pipeline = pipeline.sharpen();
    }

    // Format conversion
    const format = options.format || 'webp';
    const quality = options.quality || 85;

    switch (format) {
      case 'webp':
        pipeline = pipeline.webp({ quality, effort: 4 });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality, effort: 4 });
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ quality, compressionLevel: 9 });
        break;
    }

    const outputBuffer = await pipeline.toBuffer();
    const metadata = await sharp(outputBuffer).metadata();

    return {
      buffer: outputBuffer,
      contentType: `image/${format}`,
      size: outputBuffer.length,
      format,
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  }

  async transformWithPreset(url: string, presetName: string): Promise<TransformResponse> {
    const preset = this.presets.get(presetName);
    if (!preset) {
      throw new Error(`Preset not found: ${presetName}`);
    }

    return this.transformFromUrl(url, {
      width: preset.width,
      height: preset.height,
      format: preset.format,
      quality: preset.quality,
    });
  }

  addPreset(preset: PresetConfig): void {
    this.presets.set(preset.name, preset);
    logger.info('Preset added', { name: preset.name });
  }

  getPresets(): PresetConfig[] {
    return Array.from(this.presets.values());
  }

  private getCacheKey(url: string, options: TransformOptions): string {
    return `${url}:${JSON.stringify(options)}`;
  }

  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxCacheAge) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  private addToCache(key: string, entry: CacheEntry): void {
    // Simple LRU: if cache too big, remove oldest
    const currentSize = this.getCacheSize();
    const maxSize = this.maxCacheSize * 1024 * 1024; // Convert to bytes

    if (currentSize + entry.size > maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, entry);
  }

  private getCacheSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  private evictOldest(): void {
    let oldest: { key: string; timestamp: number } | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = { key, timestamp: entry.timestamp };
      }
    }

    if (oldest) {
      this.cache.delete(oldest.key);
      logger.debug('Cache entry evicted', { key: oldest.key });
    }
  }

  getStats() {
    return {
      totalTransformations: this.stats.transformations,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
        ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%',
      averageProcessingTime: this.stats.transformations > 0
        ? Math.round(this.stats.totalProcessingTime / this.stats.transformations)
        : 0,
      totalBytesSaved: this.stats.totalBytesSaved,
      cacheSize: this.getCacheSize(),
      cacheEntries: this.cache.size,
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }
}
