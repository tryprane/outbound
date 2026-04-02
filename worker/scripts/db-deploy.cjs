const { spawnSync } = require('node:child_process')
const { PrismaClient } = require('@prisma/client')

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }

  if (result.error) {
    throw result.error
  }
}

async function main() {
  const prisma = new PrismaClient()

  try {
    const migrationTableRows = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '_prisma_migrations'
      ) AS "exists"
    `

    const migrationTableExists = Boolean(migrationTableRows?.[0]?.exists)

    const userTableRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `

    const userTableCount = Number(userTableRows?.[0]?.count ?? 0)

    if (migrationTableExists || userTableCount === 0) {
      console.log('[db:deploy] Using prisma migrate deploy')
      run('npx', ['prisma', 'migrate', 'deploy'])
      return
    }

    console.log('[db:deploy] Legacy non-empty schema detected without _prisma_migrations; using prisma db push')
    run('npx', ['prisma', 'db', 'push', '--accept-data-loss'])
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('[db:deploy] Failed:', error)
  process.exit(1)
})
