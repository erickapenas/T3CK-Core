import { AppError } from '../errors';
import { UserContext } from '../types';

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class PageSpeedRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();

  constructor(
    private readonly maxPerHour = Number(process.env.PAGESPEED_TESTS_PER_HOUR || 10),
    private readonly now = () => Date.now()
  ) {}

  consume(context: UserContext): void {
    const key = `${context.tenantId}:${context.userId}`;
    const current = this.entries.get(key);
    const timestamp = this.now();

    if (!current || current.resetAt <= timestamp) {
      this.entries.set(key, { count: 1, resetAt: timestamp + 60 * 60 * 1000 });
      return;
    }

    if (current.count >= this.maxPerHour) {
      throw new AppError(429, 'PageSpeed test rate limit exceeded');
    }

    current.count += 1;
    this.entries.set(key, current);
  }
}
