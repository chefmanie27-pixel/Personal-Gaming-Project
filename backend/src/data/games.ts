export type Platform = 'PC' | 'PlayStation 5' | 'Xbox Series X|S' | 'Nintendo Switch'

export interface Game {
  id: string
  slug: string
  title: string
  tagline: string
  description: string
  cover: string
  hero: string
  genres: string[]
  platforms: Platform[]
  releaseDate: string
  developer: string
  publisher: string
  score: number
  reviewCount: string
  price: number
  originalPrice?: number
  store: string
  featured?: boolean
  status: 'released' | 'upcoming'
}

export const games: Game[] = [
  {
    id: '1', slug: 'starfall-requiem', title: 'Starfall Requiem',
    tagline: 'Every ending begins in the dark.',
    description: 'A cinematic action RPG about a stranded courier carrying the last living star across a ruined galaxy. Explore shattered worlds, forge impossible alliances, and decide what deserves to survive.',
    cover: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=600&q=85',
    hero: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?auto=format&fit=crop&w=1800&q=85',
    genres: ['Action RPG', 'Adventure'], platforms: ['PC', 'PlayStation 5', 'Xbox Series X|S'],
    releaseDate: '2026-09-18', developer: 'Northstar Works', publisher: 'Orbit Interactive',
    score: 94, reviewCount: '2.4k', price: 749, originalPrice: 899, store: 'Steam', featured: true, status: 'released',
  },
  {
    id: '2', slug: 'echoes-of-ash', title: 'Echoes of Ash',
    tagline: 'The fire remembers everything.',
    description: 'A haunting, tactical adventure through a volcanic kingdom where every choice leaves a mark on the world and its survivors.',
    cover: 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=600&q=85',
    hero: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1800&q=85',
    genres: ['Strategy', 'Adventure'], platforms: ['PC', 'Nintendo Switch'],
    releaseDate: '2026-08-22', developer: 'Emberline', publisher: 'Lumen Games',
    score: 91, reviewCount: '1.8k', price: 499, originalPrice: 699, store: 'GOG', status: 'released',
  },
  {
    id: '3', slug: 'neon-drift', title: 'Neon Drift',
    tagline: 'Own the night.',
    description: 'Race through a rain-soaked megacity in a precision arcade racer built around speed, style, and a synthwave soundtrack.',
    cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=85',
    hero: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1800&q=85',
    genres: ['Racing', 'Arcade'], platforms: ['PC', 'PlayStation 5'],
    releaseDate: '2026-07-14', developer: 'Velocity Lab', publisher: 'Night Shift',
    score: 88, reviewCount: '946', price: 299, originalPrice: 399, store: 'Steam', status: 'released',
  },
  {
    id: '4', slug: 'the-last-orbit', title: 'The Last Orbit',
    tagline: 'Nothing is lost in space.',
    description: 'A slow-burn science fiction mystery set aboard a silent research station at the edge of known space.',
    cover: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=600&q=85',
    hero: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1800&q=85',
    genres: ['Narrative', 'Sci-Fi'], platforms: ['PC', 'PlayStation 5', 'Nintendo Switch'],
    releaseDate: '2026-11-06', developer: 'Quiet Signal', publisher: 'Northstar Works',
    score: 86, reviewCount: 'Coming soon', price: 599, store: 'Steam', status: 'upcoming',
  },
  {
    id: '5', slug: 'mythic-tides', title: 'Mythic Tides', tagline: 'Build beyond the horizon.',
    description: 'Shape an island civilization, uncover ancient sea gods, and chart a course through an ever-changing ocean.',
    cover: 'https://images.unsplash.com/photo-1507528332888-ea7fcf204b3b?auto=format&fit=crop&w=600&q=85',
    hero: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1800&q=85',
    genres: ['Simulation', 'Strategy'], platforms: ['PC', 'Xbox Series X|S'],
    releaseDate: '2026-06-02', developer: 'Blue Current', publisher: 'Tidepool',
    score: 84, reviewCount: '3.1k', price: 399, originalPrice: 799, store: 'Steam', status: 'released',
  },
  {
    id: '6', slug: 'frostline', title: 'Frostline', tagline: 'Survive the beautiful end.',
    description: 'Lead a small expedition across a frozen continent where the weather is the least of your problems.',
    cover: 'https://images.unsplash.com/photo-1483664852095-d6cc6870702d?auto=format&fit=crop&w=600&q=85',
    hero: 'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?auto=format&fit=crop&w=1800&q=85',
    genres: ['Survival', 'Adventure'], platforms: ['PC', 'PlayStation 5', 'Xbox Series X|S'],
    releaseDate: '2026-05-19', developer: 'Whiteout', publisher: 'Lumen Games',
    score: 82, reviewCount: '1.2k', price: 349, originalPrice: 499, store: 'Steam', status: 'released',
  },
]
