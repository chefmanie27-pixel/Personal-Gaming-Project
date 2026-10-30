
export interface SteamGame {
 id: string; slug: string; title: string; tagline: string; description: string; cover: string; hero: string;
 genres: string[]; platforms: string[]; releaseDate: string; developer: string; publisher: string;
 score: number | null; reviewCount: string; price: number | null; originalPrice?: number;
 store: string; storeUrl: string; featured: boolean; status: 'released' | 'upcoming'; sourceType: string; observedAt: string
}
interface Item { id: number; name: string; header_image?: string; tiny_image?: string; final_price?: number; original_price?: number; currency?: string; price?: { final: number; initial: number; currency: string } }
interface Detail { type: string; name: string; short_description?: string; header_image: string; background?: string; genres?: { description: string }[]; release_date?: { date: string; coming_soon: boolean }; developers?: string[]; publishers?: string[]; metacritic?: { score: number }; recommendations?: { total: number }; is_free: boolean; price_overview?: { currency: string; final: number; initial: number } }
const cache = new Map<string, { expires: number; value: unknown }>()
const pending = new Map<string, Promise<unknown>>()
async function request<T>(path: string): Promise<T> {
 const hit = cache.get(path)
 if (hit && hit.expires > Date.now()) return hit.value as T
 const active = pending.get(path)
 if (active) return active as Promise<T>
 const work = (async () => {
  const response = await fetch('https://store.steampowered.com' + path, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error('Steam returned ' + response.status)
  const value: unknown = await response.json()
  if (cache.size >= 250) cache.delete(cache.keys().next().value!)
  cache.set(path, { expires: Date.now() + 600000, value })
  return value
 })()
 pending.set(path, work)
 try { return await work as T } finally { pending.delete(path) }
}
function summary(item: Item, observedAt = new Date().toISOString()): SteamGame {
 const p = item.price ?? (item.currency ? { final: item.final_price!, initial: item.original_price!, currency: item.currency } : undefined)
 const amount = p?.currency === 'ZAR' && Number.isFinite(p.final) ? p.final / 100 : null
 return { id: 'steam-' + item.id, slug: 'steam-' + item.id, title: item.name, tagline: '', description: '',
 cover: item.header_image ?? item.tiny_image ?? '', hero: item.header_image ?? item.tiny_image ?? '',
 genres: [], platforms: ['PC'], releaseDate: '', developer: 'Unavailable', publisher: 'Unavailable', score: null, reviewCount: '',
 price: amount, originalPrice: amount !== null && p && p.initial > p.final ? p.initial / 100 : undefined,
 store: 'Steam', storeUrl: 'https://store.steampowered.com/app/' + item.id + '/', featured: true, status: 'released', sourceType: 'steam', observedAt }
}
export async function steamCatalogue(search?: string): Promise<SteamGame[]> {
 if (search) {
  const result = await request<{ items: Item[] }>('/api/storesearch/?term=' + encodeURIComponent(search) + '&cc=za&l=english')
  return result.items.map(item => summary(item, new Date(cache.get('/api/storesearch/?term=' + encodeURIComponent(search) + '&cc=za&l=english')!.expires - 600000).toISOString()))
 }
 const result = await request<Record<string, { items?: Item[] }>>('/api/featuredcategories/?cc=za&l=english')
 const unique = new Map<number, Item>()
 for (const category of ['specials', 'top_sellers', 'new_releases', 'coming_soon']) for (const item of result[category]?.items ?? []) unique.set(item.id, item)
 if (!unique.size) throw new Error('Steam returned no games')
 return [...unique.values()].map(item => summary(item, new Date(cache.get('/api/featuredcategories/?cc=za&l=english')!.expires - 600000).toISOString()))
}
export async function steamGame(slug: string): Promise<SteamGame | null> {
 const match = /^steam-([1-9][0-9]{0,9})$/.exec(slug)
 if (!match) return null
 const id = match[1]
 const result = await request<Record<string, { success: boolean; data?: Detail }>>('/api/appdetails?appids=' + id + '&cc=za&l=english')
 const item = result[id]
 if (!item?.success || !item.data || item.data.type !== 'game') return null
 const d = item.data
 const game = summary({ id: Number(id), name: d.name, header_image: d.header_image, price: d.price_overview }, new Date(cache.get('/api/appdetails?appids=' + id + '&cc=za&l=english')!.expires - 600000).toISOString())
 game.description = (d.short_description ?? '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
 game.tagline = game.description
 game.hero = d.background || d.header_image
 game.genres = d.genres?.map(g => g.description) ?? []
 game.developer = d.developers?.join(', ') || 'Unavailable'
 game.publisher = d.publishers?.join(', ') || 'Unavailable'
 game.score = d.metacritic?.score ?? null
 game.reviewCount = String(d.recommendations?.total ?? '')
 game.releaseDate = d.release_date?.date ?? ''
 game.status = d.release_date?.coming_soon ? 'upcoming' : 'released'
 if (d.is_free) game.price = 0
 return game
}
