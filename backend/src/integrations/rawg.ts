import { config } from '../config.js'
import type { Game } from '../data/games.js'
import { UnconfiguredProviderError } from './types.js'

interface RawgGame {
  id: number
  slug: string
  name: string
  description_raw?: string
  background_image?: string
  released?: string
  rating?: number
  ratings_count?: number
}

function mapGame(item: RawgGame): Game {
  return {
    id: String(item.id), slug: item.slug, title: item.name, tagline: 'Metadata imported from RAWG.',
    description: item.description_raw ?? '', cover: item.background_image ?? '', hero: item.background_image ?? '',
    genres: [], platforms: [], releaseDate: item.released ?? '', developer: 'Unknown', publisher: 'Unknown',
    score: Math.round((item.rating ?? 0) * 20), reviewCount: String(item.ratings_count ?? 0),
    price: 0, store: 'Unavailable', status: item.released && item.released <= new Date().toISOString().slice(0, 10) ? 'released' : 'upcoming',
  }
}

async function request<T>(path: string): Promise<T> {
  if (!config.RAWG_API_KEY) throw new UnconfiguredProviderError('RAWG')
  const response = await fetch(`https://api.rawg.io/api${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.RAWG_API_KEY)}`)
  if (!response.ok) throw new Error(`RAWG request failed with status ${response.status}`)
  return response.json() as Promise<T>
}

export const rawgProvider = {
  name: 'rawg',
  async search(query: string) {
    const result = await request<{ results: RawgGame[] }>(`/games?search=${encodeURIComponent(query)}&page_size=20`)
    return result.results.map(mapGame)
  },
  async getByExternalId(id: string) {
    const result = await request<RawgGame>(`/games/${encodeURIComponent(id)}`)
    return mapGame(result)
  },
}
