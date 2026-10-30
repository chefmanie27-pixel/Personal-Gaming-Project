import { prisma } from '../db.js'

export async function evaluatePriceAlerts() {
  const alerts = await prisma.priceAlert.findMany({
    where: { active: true },
    include: { listing: { include: { prices: { orderBy: { observedAt: 'desc' }, take: 1 } } } },
  })
  let triggered = 0
  for (const alert of alerts) {
    const latest = alert.listing.prices[0]
    if (!latest || latest.currency !== alert.currency || Number(latest.amount) > Number(alert.target)) continue
    await prisma.priceAlert.update({ where: { id: alert.id }, data: { lastTriggered: new Date() } })
    triggered += 1
  }
  return { inspected: alerts.length, triggered }
}
