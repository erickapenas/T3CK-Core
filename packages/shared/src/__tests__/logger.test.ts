import { Logger, LogLevel } from '../logger';

describe('Logger', () => {
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  beforeEach(() => {
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.debug = jest.fn();
  });

  afterEach(() => {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
    jest.restoreAllMocks();
  });

  it('logs info by default', () => {
    const logger = new Logger('test-service');
    logger.info('hello', { requestId: 'req-1' });

    expect(console.info).toHaveBeenCalled();
    const payload = JSON.parse((console.info as jest.Mock).mock.calls[0][0]);
    expect(payload.level).toBe('info');
    expect(payload.service).toBe('test-service');
    expect(payload.message).toBe('hello');
    expect(payload.requestId).toBe('req-1');
  });

  it('respects log level threshold', () => {
    const logger = new Logger('test-service', LogLevel.WARN);
    logger.info('ignore');
    logger.warn('warn');

    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('logs errors', () => {
    const logger = new Logger('test-service');
    logger.error('boom', { tenantId: 't1' });

    expect(console.error).toHaveBeenCalled();
    const payload = JSON.parse((console.error as jest.Mock).mock.calls[0][0]);
    expect(payload.level).toBe('error');
    expect(payload.tenantId).toBe('t1');
  });
});
