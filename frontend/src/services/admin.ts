import axios from 'axios'

const client = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api' })
function headers(token: string) { return { Authorization: `Bearer ${token}` } }

export interface AdminStats { users: number; games: number; reviews: number; listings: number; prices: number; failedSyncs: number }
export interface SyncLog { id: string; provider: string; job: string; status: string; startedAt: string; finishedAt?: string; processed: number; error?: string }

export async function fetchAdminStats(token: string) {
  const { data } = await client.get<{ data: AdminStats }>('/admin/stats', { headers: headers(token) })
  return data.data
}
export async function fetchSyncLogs(token: string) {
  const { data } = await client.get<{ data: SyncLog[] }>('/admin/sync-logs', { headers: headers(token) })
  return data.data
}
export async function runSync(token: string, provider: string, job: string) {
  const { data } = await client.post<{ data: SyncLog }>('/admin/sync', { provider, job }, { headers: headers(token) })
  return data.data
}
