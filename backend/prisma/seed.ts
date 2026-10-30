import { PrismaClient } from '@prisma/client'
import { games } from '../src/data/games.js'

const prisma = new PrismaClient()

async function main() {
  for (const game of games) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: { title: game.title, description: game.description, cover: game.cover, hero: game.hero, tagline: game.tagline, releaseDate: new Date(game.releaseDate), developer: game.developer, publisher: game.publisher, score: game.score },
      create: { slug: game.slug, title: game.title, description: game.description, cover: game.cover, hero: game.hero, tagline: game.tagline, releaseDate: new Date(game.releaseDate), developer: game.developer, publisher: game.publisher, score: game.score },
    })
  }
}

main().finally(() => prisma.$disconnect())
