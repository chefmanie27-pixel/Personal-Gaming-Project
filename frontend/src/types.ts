export interface Game {
  id: string
  slug: string
  title: string
  tagline: string
  description: string
  cover: string
  hero: string
  genres: string[]
  platforms: string[]
  releaseDate: string
  developer: string
  publisher: string
  score: number | null
  reviewCount: string
  price: number | null
  originalPrice?: number
  store: string
  storeUrl?: string
  observedAt?: string
  featured?: boolean
  status: 'released' | 'upcoming'
}

export interface GamesResponse {
  data: Game[]
  meta: { total: number; page: number; limit: number; pages: number }
}
