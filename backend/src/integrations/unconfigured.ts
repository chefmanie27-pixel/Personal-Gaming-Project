import { UnconfiguredProviderError } from './types.js'

export function createUnconfiguredProvider(provider: string) {
  return {
    name: provider,
    async search() { throw new UnconfiguredProviderError(provider) },
    async getByExternalId() { throw new UnconfiguredProviderError(provider) },
    async getPrices() { throw new UnconfiguredProviderError(provider) },
    async getReviews() { throw new UnconfiguredProviderError(provider) },
  }
}
