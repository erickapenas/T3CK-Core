export interface LogEntry {
  level: 'info' | 'error' | 'debug' | 'warn';
  message: string;
  [key: string]: unknown;
}

class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private formatLog(level: string, message: string, data?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      level: level as 'info' | 'error' | 'debug' | 'warn',
      message,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      ...data,
    };

    console.log(JSON.stringify(logEntry));
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.formatLog('INFO', message, data);
  }

  error(message: string, data?: Record<string, unknown> | Error): void {
    const errorData = data instanceof Error
      ? { error: { name: data.name, message: data.message, stack: data.stack } }
      : data;
    this.formatLog('ERROR', message, errorData);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.formatLog('DEBUG', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.formatLog('WARN', message, data);
  }
}

export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName);
}