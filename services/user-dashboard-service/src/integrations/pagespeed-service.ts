import { AppError } from '../errors';
import { PageSpeedMetrics, PageSpeedReportRecord } from './types';

type PageSpeedStrategy = 'mobile' | 'desktop';

export interface PageSpeedRunInput {
  url: string;
  strategy?: PageSpeedStrategy;
}

function normalizeScore(value: unknown): number {
  return Math.round(Number(value || 0) * 100);
}

function numericAuditValue(
  audits: Record<string, { numericValue?: number }>,
  key: string
): number | undefined {
  const value = audits[key]?.numericValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parsePageSpeedResponse(body: any): {
  metrics: PageSpeedMetrics;
  rawSummary: Record<string, unknown>;
} {
  const lighthouse = body.lighthouseResult || {};
  const categories = lighthouse.categories || {};
  const audits = lighthouse.audits || {};

  const metrics: PageSpeedMetrics = {
    performance: normalizeScore(categories.performance?.score),
    accessibility: normalizeScore(categories.accessibility?.score),
    bestPractices: normalizeScore(categories['best-practices']?.score),
    seo: normalizeScore(categories.seo?.score),
    lcpMs: numericAuditValue(audits, 'largest-contentful-paint'),
    cls: numericAuditValue(audits, 'cumulative-layout-shift'),
    inpMs: numericAuditValue(audits, 'interaction-to-next-paint'),
    fidMs: numericAuditValue(audits, 'max-potential-fid'),
    totalBlockingTimeMs: numericAuditValue(audits, 'total-blocking-time'),
    speedIndexMs: numericAuditValue(audits, 'speed-index'),
    loadTimeMs: numericAuditValue(audits, 'interactive'),
  };

  return {
    metrics,
    rawSummary: {
      fetchTime: lighthouse.fetchTime,
      finalUrl: lighthouse.finalUrl,
      requestedUrl: body.id,
      userAgent: lighthouse.userAgent,
    },
  };
}

function mockMetrics(
  url: string,
  strategy: PageSpeedStrategy
): {
  metrics: PageSpeedMetrics;
  rawSummary: Record<string, unknown>;
} {
  const seed = Array.from(url).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const penalty = strategy === 'mobile' ? 8 : 0;
  const performance = Math.max(45, Math.min(98, 92 - (seed % 35) - penalty));

  return {
    metrics: {
      performance,
      accessibility: Math.max(60, 96 - (seed % 12)),
      bestPractices: Math.max(60, 94 - (seed % 15)),
      seo: Math.max(60, 97 - (seed % 10)),
      lcpMs: 1800 + (seed % 1200) + penalty * 80,
      cls: Number(((seed % 9) / 100).toFixed(3)),
      inpMs: 120 + (seed % 180),
      fidMs: 80 + (seed % 140),
      totalBlockingTimeMs: 120 + (seed % 220),
      speedIndexMs: 2200 + (seed % 1200),
      loadTimeMs: 2600 + (seed % 1400),
    },
    rawSummary: {
      mode: 'mock',
      finalUrl: url,
      strategy,
    },
  };
}

export class PageSpeedService {
  async run(input: PageSpeedRunInput): Promise<{
    url: string;
    strategy: PageSpeedStrategy;
    metrics: PageSpeedMetrics;
    rawSummary: Record<string, unknown>;
  }> {
    const url = this.validateUrl(input.url);
    const strategy = input.strategy || 'mobile';
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    const mockMode = process.env.PAGESPEED_MOCK_MODE !== 'false' || !apiKey;

    const result = mockMode
      ? mockMetrics(url, strategy)
      : await this.runLive(url, strategy, apiKey);

    return {
      url,
      strategy,
      ...result,
    };
  }

  toReport(input: {
    id: string;
    tenantId: string;
    userId: string;
    url: string;
    strategy: PageSpeedStrategy;
    metrics: PageSpeedMetrics;
    rawSummary: Record<string, unknown>;
    createdAt: string;
  }): PageSpeedReportRecord {
    return input;
  }

  private validateUrl(value: string): string {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('invalid protocol');
      }
      return url.toString();
    } catch (_error) {
      throw new AppError(400, 'Invalid URL for PageSpeed test');
    }
  }

  private async runLive(url: string, strategy: PageSpeedStrategy, apiKey: string) {
    const requestUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    requestUrl.searchParams.set('url', url);
    requestUrl.searchParams.set('strategy', strategy);
    requestUrl.searchParams.set('category', 'performance');
    requestUrl.searchParams.append('category', 'accessibility');
    requestUrl.searchParams.append('category', 'best-practices');
    requestUrl.searchParams.append('category', 'seo');
    requestUrl.searchParams.set('key', apiKey);

    const response = await fetch(requestUrl);
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      lighthouseResult?: unknown;
      id?: string;
    };
    if (!response.ok) {
      throw new AppError(
        response.status,
        body.error?.message || 'PageSpeed Insights request failed'
      );
    }

    return parsePageSpeedResponse(body);
  }
}
