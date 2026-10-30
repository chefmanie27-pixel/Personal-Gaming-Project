import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { z } from 'zod'
import { games } from './data/games.js'
import { steamCatalogue, steamGame } from './integrations/steam.js'
import { config } from './config.js'
import { prisma } from './db.js'
import { hashPassword, issueToken, requireAuth, requireAdmin, verifyPassword, type AuthRequest } from './auth.js'
import { evaluatePriceAlerts } from './jobs/priceAlerts.js'
import { startScheduler } from './jobs/scheduler.js'

const app = express()
const port = config.PORT
app.use(cors({ origin: config.FRONTEND_ORIGIN }))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'gamevault-api' }))


app.get('/api/games', async (req, res) => {
 const parsed = z.object({ search: z.string().max(200).optional(), genre: z.string().optional(), platform: z.string().optional(), sort: z.enum(['featured','score','newest','price']).default('featured'), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(12) }).safeParse(req.query)
 if (!parsed.success) return res.status(400).json({ error: 'Invalid catalogue filters' })
 try {
  const { search, genre, platform, sort, page, limit } = parsed.data
  let result = await steamCatalogue(search)
  if (genre || sort === 'score' || sort === 'newest') {
   const details = []
   for (let i = 0; i < result.length; i += 4) details.push(...await Promise.all(result.slice(i,i+4).map(g => steamGame(g.slug))))
   result = details.filter((g): g is NonNullable<typeof g> => g !== null)
  }
  result = result.filter(g => (!genre || g.genres.includes(genre)) && (!platform || g.platforms.includes(platform)))
  if (sort === 'price') result.sort((a,b) => (a.price ?? Infinity) - (b.price ?? Infinity))
  if (sort === 'score') result.sort((a,b) => (b.score ?? -1) - (a.score ?? -1))
  if (sort === 'newest') result.sort((a,b) => (Date.parse(b.releaseDate) || 0) - (Date.parse(a.releaseDate) || 0))
  return res.json({ data: result.slice((page-1)*limit,page*limit), meta: { total: result.length, page, limit, pages: Math.ceil(result.length/limit), sourceType: 'steam', scope: search ? 'Steam search results' : 'Steam featured collections' } })
 } catch { return res.status(502).json({ error: 'Steam is unavailable. Please try again shortly.' }) }
})
app.get('/api/games/:slug', async (req,res) => {
 try { const game = await steamGame(String(req.params.slug)); return game ? res.json({ data: game }) : res.status(404).json({ error: 'Game not found' }) }
 catch { return res.status(502).json({ error: 'Steam is unavailable. Please try again shortly.' }) }
})
app.get('/api/deals', async (req,res) => {
 const budget = z.coerce.number().positive().optional().safeParse(req.query.budget)
 if (!budget.success) return res.status(400).json({ error: 'Budget must be positive' })
 try {
  const catalogue = await steamCatalogue()
  const deals = catalogue.filter(g => g.price !== null && g.originalPrice && (budget.data === undefined || g.price <= budget.data)).map(g => ({ ...g, discount: Math.round((1-g.price!/g.originalPrice!)*100) })).sort((a,b) => b.discount-a.discount)
  return res.json({ data: deals, meta: { sourceType: 'steam', currency: 'ZAR', updatedAt: catalogue[0]?.observedAt } })
 } catch { return res.status(502).json({ error: 'Steam is unavailable. Please try again shortly.' }) }
})
app.get('/api/games/:slug/price-history', async (req,res) => {
 if (!/^steam-[1-9][0-9]{0,9}$/.test(String(req.params.slug))) return res.status(404).json({ error: 'Game not found' })
 try {
  const stored = await prisma.regionalPrice.findMany({ where: { listing: { game: { slug: String(req.params.slug) } }, region: 'ZA', currency: 'ZAR', sourceType: { not: 'mock' } }, orderBy: { observedAt: 'asc' }, select: { amount: true, observedAt: true, sourceType: true } })
  return res.json({ data: stored.map(p => ({ amount: Number(p.amount), observedAt: p.observedAt, sourceType: p.sourceType })), meta: { currency: 'ZAR', sourceType: 'observed' } })
 } catch { return res.json({ data: [], meta: { currency: 'ZAR', sourceType: 'unavailable' } }) }
})

const credentials = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(8).max(128) })

app.post('/api/auth/register', async (req, res, next) => {
  const parsed = credentials.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required', details: parsed.error.flatten() })
  try {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' })
    const user = await prisma.user.create({ data: { email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) }, select: { id: true, email: true, role: true } })
    return res.status(201).json({ data: { user, token: issueToken(user) } })
  } catch (error) { return next(error) }
})

app.post('/api/auth/login', async (req, res, next) => {
  const parsed = credentials.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' })
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' })
    return res.json({ data: { user: { id: user.id, email: user.email, role: user.role }, token: issueToken(user) } })
  } catch (error) { return next(error) }
})

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, role: true } })
    return user ? res.json({ data: user }) : res.status(404).json({ error: 'User not found' })
  } catch (error) { return next(error) }
})

app.get('/api/wishlist', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const items = await prisma.wishlistItem.findMany({ where: { userId: req.user!.id }, include: { game: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ data: items })
  } catch (error) { return next(error) }
})

app.post('/api/wishlist', requireAuth, async (req: AuthRequest, res, next) => {
  const parsed = z.object({ gameSlug: z.string().min(1), target: z.number().positive().optional(), currency: z.string().length(3).default('ZAR') }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid wishlist item', details: parsed.error.flatten() })
  try {
    const game = await prisma.game.findUnique({ where: { slug: parsed.data.gameSlug } })
    if (!game) return res.status(404).json({ error: 'Game is not available in the database yet' })
    const item = await prisma.wishlistItem.upsert({
      where: { userId_gameId: { userId: req.user!.id, gameId: game.id } },
      create: { userId: req.user!.id, gameId: game.id, target: parsed.data.target, currency: parsed.data.currency },
      update: { target: parsed.data.target, currency: parsed.data.currency },
      include: { game: true },
    })
    return res.status(201).json({ data: item })
  } catch (error) { return next(error) }
})

app.delete('/api/wishlist/:gameId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.wishlistItem.delete({ where: { userId_gameId: { userId: req.user!.id, gameId: String(req.params.gameId) } } })
    return res.status(204).send()
  } catch (error) { return next(error) }
})

app.get('/api/alerts', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const alerts = await prisma.priceAlert.findMany({
      where: { userId: req.user!.id },
      include: { listing: { include: { game: true, store: true, prices: { orderBy: { observedAt: 'desc' }, take: 1 } } } },
      orderBy: { lastTriggered: 'desc' },
    })
    return res.json({ data: alerts })
  } catch (error) { return next(error) }
})

app.post('/api/alerts', requireAuth, async (req: AuthRequest, res, next) => {
  const parsed = z.object({ gameSlug: z.string().min(1), target: z.number().positive(), currency: z.string().length(3).default('ZAR') }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'A game, positive target price, and three-letter currency are required', details: parsed.error.flatten() })
  try {
    const listing = await prisma.storeListing.findFirst({
      where: { game: { slug: parsed.data.gameSlug }, prices: { some: { currency: parsed.data.currency, region: 'ZA' } } },
    })
    if (!listing) return res.status(404).json({ error: 'No regional price listing is available for this game yet' })
    const alert = await prisma.priceAlert.create({ data: { userId: req.user!.id, listingId: listing.id, target: parsed.data.target, currency: parsed.data.currency }, include: { listing: { include: { game: true, store: true } } } })
    return res.status(201).json({ data: alert })
  } catch (error) { return next(error) }
})

app.patch('/api/alerts/:id', requireAuth, async (req: AuthRequest, res, next) => {
  const parsed = z.object({ active: z.boolean().optional(), target: z.number().positive().optional() }).refine((value) => value.active !== undefined || value.target !== undefined).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Provide an active state or positive target price' })
  try {
    const result = await prisma.priceAlert.updateMany({ where: { id: String(req.params.id), userId: req.user!.id }, data: parsed.data })
    return result.count ? res.status(204).send() : res.status(404).json({ error: 'Alert not found' })
  } catch (error) { return next(error) }
})

app.delete('/api/alerts/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const result = await prisma.priceAlert.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } })
    return result.count ? res.status(204).send() : res.status(404).json({ error: 'Alert not found' })
  } catch (error) { return next(error) }
})

app.get('/api/admin/stats', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [users, catalogueGames, reviews, listings, prices, failedSyncs] = await Promise.all([
      prisma.user.count(), prisma.game.count(), prisma.review.count(), prisma.storeListing.count(),
      prisma.regionalPrice.count(), prisma.syncLog.count({ where: { status: 'FAILED' } }),
    ])
    return res.json({ data: { users, games: catalogueGames, reviews, listings, prices, failedSyncs } })
  } catch (error) { return next(error) }
})

app.get('/api/admin/sync-logs', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const logs = await prisma.syncLog.findMany({ orderBy: { startedAt: 'desc' }, take: 20 })
    return res.json({ data: logs })
  } catch (error) { return next(error) }
})

app.post('/api/admin/sync', requireAuth, requireAdmin, async (req, res, next) => {
  const parsed = z.object({ provider: z.enum(['mock', 'rawg', 'igdb', 'steam']), job: z.enum(['metadata', 'reviews', 'prices']) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid synchronization request', details: parsed.error.flatten() })
  try {
    const log = await prisma.syncLog.create({ data: { provider: parsed.data.provider, job: parsed.data.job, status: 'RUNNING' } })
    if (parsed.data.provider !== 'mock') {
      const failed = await prisma.syncLog.update({ where: { id: log.id }, data: { status: 'FAILED', finishedAt: new Date(), error: 'Provider adapter is not configured. Confirm credentials and terms before enabling it.' } })
      return res.status(409).json({ error: 'Provider is not configured', data: failed })
    }
    const completed = await prisma.syncLog.update({ where: { id: log.id }, data: { status: 'SUCCEEDED', finishedAt: new Date(), processed: games.length } })
    return res.status(201).json({ data: completed })
  } catch (error) { return next(error) }
})

app.post('/api/admin/alerts/evaluate', requireAuth, requireAdmin, async (_req, res, next) => {
  try { return res.json({ data: await evaluatePriceAlerts() }) } catch (error) { return next(error) }
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  return res.status(500).json({ error: 'An unexpected server error occurred' })
})

app.listen(port, () => {
  startScheduler()
  console.log(`GameVault API listening on http://localhost:${port}`)
})
