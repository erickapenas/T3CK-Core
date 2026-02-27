import { Request, Response, NextFunction } from 'express';

export function requireInternalApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    next();
    return;
  }

  const provided = req.headers['x-internal-api-key'] as string | undefined;
  if (!provided || provided !== expected) {
    res.status(403).json({ error: 'Forbidden', message: 'Invalid internal API key' });
    return;
  }

  next();
}
