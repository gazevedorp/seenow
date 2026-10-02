export class ProviderRequestError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.status = status
    this.retryable = retryable
  }
}

export function httpFailure(status: number, message: string): ProviderRequestError {
  const retryable = status === 408 || status === 429 || status >= 500
  return new ProviderRequestError(message, status, retryable)
}

export async function withRetry<T>(work: () => Promise<T>, attempts: number): Promise<{ value: T; retryCount: number }> {
  let last: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return { value: await work(), retryCount: attempt }
    } catch (error) {
      last = error
      const retryable = error instanceof ProviderRequestError ? error.retryable : true
      if (!retryable || attempt === attempts - 1) break
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
  if (last instanceof Error) throw last
  throw new ProviderRequestError("O provedor falhou.", 502, false)
}
