export interface TransformOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  quality?: number;
  blur?: number;
  grayscale?: boolean;
  sharpen?: boolean;
}

export interface TransformRequest {
  url?: string;
  buffer?: Buffer;
  options: TransformOptions;
}

export interface TransformResponse {
  buffer: Buffer;
  contentType: string;
  size: number;
  format: string;
  width: number;
  height: number;
}

export interface PresetConfig {
  name: string;
  width?: number;
  height?: number;
  format: 'webp' | 'avif' | 'jpeg' | 'png';
  quality: number;
}

export interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
  size: number;
}

export interface MediaStats {
  totalTransformations: number;
  cacheHits: number;
  cacheMisses: number;
  averageProcessingTime: number;
  totalBytesSaved: number;
}
