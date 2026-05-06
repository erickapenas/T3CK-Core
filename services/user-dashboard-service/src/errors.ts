export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class DownstreamError extends AppError {
  constructor(
    status: number,
    message: string,
    public readonly upstream?: string
  ) {
    super(status, message);
    this.name = 'DownstreamError';
  }
}
