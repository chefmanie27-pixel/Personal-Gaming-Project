import { evaluatePriceAlerts } from './priceAlerts.js'

const intervalMs = 15 * 60 * 1000
let timer: ReturnType<typeof setInterval> | undefined

export function startScheduler() {
  if (timer) return
  timer = setInterval(() => {
    evaluatePriceAlerts().catch((error) => console.error('Price alert evaluation failed', error))
  }, intervalMs)
  timer.unref()
}
