import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const counts = await prisma.warmupMailLog.groupBy({
    by: ['recipientMailAccountId'],
    _count: true,
  })
  console.log('Result type:', typeof counts[0]?._count)
  console.log('Result:', counts[0]?._count)
}

main().catch(console.error).finally(() => prisma.$disconnect())
