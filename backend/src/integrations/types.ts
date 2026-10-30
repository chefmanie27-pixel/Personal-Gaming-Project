import type { Game } from '../data/games.js'

export interface MetadataProvider {
  readonly name: string
  search(query: string): Promise<Game[]>
  getByExternalId(id: string): Promise<Game | null>
}

export interface PriceProvider {
  readonly name: string
  getPrices(gameExternalId: string, region: string): Promise<Array<{
    store: string
    amount: number
    currency: string
    originalAmount?: number
    url: string
    observedAt: string
  }>>
}

export interface ReviewProvider {
  readonly name: string
  getReviews(gameExternalId: string): Promise<Array<{
    score: number
    scale: number
    url: string
    publishedAt?: string
    attribution: string
  }>>
}

export class UnconfiguredProviderError extends Error {
  constructor(provider: string) {
    super(`${provider} integration is not configured. Add credentials and confirm provider terms before enabling it.`)
    this.name = 'UnconfiguredProviderError'
  }
}
