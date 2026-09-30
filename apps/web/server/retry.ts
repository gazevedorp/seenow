export class ProviderRequestError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.name = "ProviderRequestError"
    this.status = status
    this.retryable = retryable
  }
}

export function httpFailure(status: number, message: string): ProviderRequestError {
  return new ProviderRequestError(message, status, status >= 500 || status === 408 || status === 429)
}

export async function withRetry<T>(run: () => Promise<T>, attempts: number): Promise<{ value: T; retryCount: number }> {
  let last: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return { value: await run(), retryCount: attempt }
    } catch (error) {
      last = error
      const retryable = !(error instanceof ProviderRequestError) || error.retryable
      if (!retryable || attempt >= attempts - 1) break
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2000))
    }
  }
  throw last
}
