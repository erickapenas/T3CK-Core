# Media Transformation Service

REST API for on-demand image optimization, format conversion, and responsive resizing.

## Features

- ✅ **Format Conversion**: WebP, AVIF, JPEG, PNG
- ✅ **Responsive Resizing**: Intelligent fit modes
- ✅ **Compression**: High-quality compression up to 90% savings
- ✅ **Effects**: Blur, grayscale, sharpen
- ✅ **Presets**: Pre-configured optimization profiles
- ✅ **Caching**: In-memory LRU cache
- ✅ **Stats**: Real-time performance metrics

## API Endpoints

### Transform from URL

```bash
GET /transform?url=https://example.com/image.jpg&w=640&format=webp&quality=85
```

**Query Parameters**:
- `url` (required): Source image URL
- `w`: Target width
- `h`: Target height
- `fit`: Resize mode (`cover`, `contain`, `fill`, `inside`, `outside`)
- `format`: Output format (`webp`, `avif`, `jpeg`, `png`)
- `quality`: Quality 1-100
- `blur`: Blur sigma 0.3-1000
- `grayscale`: Convert to grayscale (`true`)
- `sharpen`: Apply sharpening (`true`)

### Transform with Preset

```bash
GET /preset/medium?url=https://example.com/image.jpg
```

**Built-in Presets**:
- `thumbnail`: 150x150 WebP Q80
- `small`: 320px WebP Q85
- `medium`: 640px WebP Q85
- `large`: 1024px WebP Q90
- `xlarge`: 1920px WebP Q90
- `avif-small`: 640px AVIF Q75
- `avif-medium`: 1024px AVIF Q80

### Upload and Transform

```bash
POST /upload
Content-Type: multipart/form-data

Form fields:
- image: File
- width, height, format, quality, etc.
```

### Get Presets

```bash
GET /presets
```

### Add Custom Preset

```bash
POST /presets
Content-Type: application/json

{
  "name": "custom",
  "width": 800,
  "format": "webp",
  "quality": 90
}
```

### Stats

```bash
GET /stats
```

### Clear Cache

```bash
POST /cache/clear
```

## Usage Examples

### Responsive Images (srcset)

```html
<img 
  src="/transform?url=IMAGE_URL&w=640&format=webp"
  srcset="
    /transform?url=IMAGE_URL&w=320&format=webp 320w,
    /transform?url=IMAGE_URL&w=640&format=webp 640w,
    /transform?url=IMAGE_URL&w=1024&format=webp 1024w
  "
  sizes="(max-width: 640px) 320px, (max-width: 1024px) 640px, 1024px"
  alt="Optimized image"
/>
```

### Modern Format Detection

```html
<picture>
  <source srcset="/preset/avif-medium?url=IMAGE_URL" type="image/avif">
  <source srcset="/preset/medium?url=IMAGE_URL" type="image/webp">
  <img src="/transform?url=IMAGE_URL&w=640" alt="Fallback">
</picture>
```

## Environment Variables

```bash
PORT=3007
NODE_ENV=production
```

## Development

```bash
pnpm install
pnpm dev
```

## Production

```bash
pnpm build
pnpm start
```

## Performance

- **Cache Hit Rate**: ~80% (typical)
- **Compression**: 70-90% size reduction (WebP/AVIF)
- **Processing Time**: 50-200ms per image
- **Throughput**: 100+ images/sec (cached)

## Integration with Product Service

```typescript
// Store optimized URLs in product data
const product = {
  id: 'prod-1',
  images: [
    {
      original: 'https://cdn.example.com/product.jpg',
      thumbnail: '/preset/thumbnail?url=https://cdn.example.com/product.jpg',
      small: '/preset/small?url=https://cdn.example.com/product.jpg',
      medium: '/preset/medium?url=https://cdn.example.com/product.jpg',
      large: '/preset/large?url=https://cdn.example.com/product.jpg',
    }
  ]
};
```
