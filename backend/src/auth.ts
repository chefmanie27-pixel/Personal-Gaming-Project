import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { config } from './config.js'

export type AuthRequest = Request & { user?: { id: string; role: string } }

export function hashPassword(password: string) { return bcrypt.hash(password, 12) }
export function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash) }
export function issueToken(user: { id: string; role: string }) {
  return jwt.sign({ role: user.role }, config.JWT_SECRET, { subject: user.id, expiresIn: '7d' })
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization')
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' })
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET)
    if (typeof payload === 'string' || !payload.sub || typeof payload.role !== 'string') throw new Error('Invalid token')
    req.user = { id: payload.sub, role: payload.role }
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Administrator access required' })
  return next()
}
