import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { warmupProcessorTestUtils } from '~/processors/warmupProcessor'

const originalDeps = {
  prisma: warmupProcessorTestUtils.warmupDeps.prisma,
  mailboxSyncQueue: warmupProcessorTestUtils.warmupDeps.mailboxSyncQueue,
  sendViaGmail: warmupProcessorTestUtils.warmupDeps.sendViaGmail,
  sendViaZoho: warmupProcessorTestUtils.warmupDeps.sendViaZoho,
  random: warmupProcessorTestUtils.warmupDeps.random,
  now: warmupProcessorTestUtils.warmupDeps.now,
}

afterEach(() => {
  warmupProcessorTestUtils.warmupDeps.prisma = originalDeps.prisma
  warmupProcessorTestUtils.warmupDeps.mailboxSyncQueue = originalDeps.mailboxSyncQueue
  warmupProcessorTestUtils.warmupDeps.sendViaGmail = originalDeps.sendViaGmail
  warmupProcessorTestUtils.warmupDeps.sendViaZoho = originalDeps.sendViaZoho
  warmupProcessorTestUtils.warmupDeps.random = originalDeps.random
  warmupProcessorTestUtils.warmupDeps.now = originalDeps.now
})

test('getFirstName derives a friendly first token', () => {
  assert.equal(warmupProcessorTestUtils.getFirstName('john.doe@example.com'), 'john')
  assert.equal(warmupProcessorTestUtils.getFirstName('Jane_Doe Smith'), 'Jane')
  assert.equal(warmupProcessorTestUtils.getFirstName('   '), 'there')
})

test('classifyWarmupFailure separates bounces from generic failures', () => {
  assert.equal(
    warmupProcessorTestUtils.classifyWarmupFailure(new Error('550 mailbox unavailable')),
    'bounced'
  )
  assert.equal(
    warmupProcessorTestUtils.classifyWarmupFailure(new Error('temporary network issue')),
    'failed'
  )
})

test('isAuthGrantFailure detects token refresh failures', () => {
  assert.equal(
    warmupProcessorTestUtils.isAuthGrantFailure(new Error('invalid_grant: Token has been expired or revoked')),
    true
  )
  assert.equal(warmupProcessorTestUtils.isAuthGrantFailure(new Error('smtp timeout')), false)
})

test('chooseWarmupRecipient prefers least-used cross-domain system mailbox', async () => {
  const fakePrisma = {
    warmupRecipient: {
      findMany: async () => [
        { email: 'external@other.com', name: 'External User', isActive: true, isSystem: false },
      ],
    },
    mailAccount: {
      findMany: async () => [
        { id: 'same-domain', email: 'peer@example.com', displayName: 'Same Domain', type: 'gmail' },
        { id: 'cross-domain', email: 'peer@other.com', displayName: 'Cross Domain', type: 'gmail' },
      ],
    },
    warmupMailLog: {
      groupBy: async () => [
        { recipientMailAccountId: 'cross-domain', _count: { _all: 0 } },
        { recipientMailAccountId: 'same-domain', _count: { _all: 5 } },
      ],
    },
  }

  warmupProcessorTestUtils.warmupDeps.prisma = fakePrisma as never

  const recipient = await warmupProcessorTestUtils.chooseWarmupRecipient('sender-1', 'owner@example.com')

  assert.deepEqual(recipient, {
    type: 'system',
    email: 'peer@other.com',
    recipientMailAccountId: 'cross-domain',
    recipientDisplayName: 'Cross Domain',
  })
})

test('chooseWarmupRecipient prefers custom recipients over cold internal fallbacks', async () => {
  const fakePrisma = {
    warmupRecipient: {
      findMany: async () => [
        { email: 'external@other.com', name: 'External User', isActive: true, isSystem: false },
      ],
    },
    mailAccount: {
      findMany: async ({ where }: { where?: { warmupStatus?: { in: string[] } } }) => {
        if (where?.warmupStatus) return []
        return [
          { id: 'cold-1', email: 'cold@internal.com', displayName: 'Cold Internal', type: 'gmail', warmupStatus: 'COLD' },
        ]
      },
    },
    warmupMailLog: {
      groupBy: async ({ by }: { by: string[] }) => {
        if (by.includes('recipientEmail')) {
          return [{ recipientEmail: 'external@other.com', _count: { _all: 0 } }]
        }
        return []
      },
    },
  }

  warmupProcessorTestUtils.warmupDeps.prisma = fakePrisma as never

  const recipient = await warmupProcessorTestUtils.chooseWarmupRecipient('sender-1', 'owner@example.com')

  assert.deepEqual(recipient, {
    type: 'external',
    email: 'external@other.com',
    recipientMailAccountId: null,
    recipientDisplayName: 'External User',
  })
})

test('processWarmupJob sends a warmup email, logs it, and enqueues mailbox sync', async () => {
  const sender = {
    id: 'sender-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    type: 'gmail',
    warmupAutoEnabled: true,
    warmupStatus: 'WARMING',
    recommendedDailyLimit: 20,
    sentToday: 1,
    lastMailSentAt: null,
    warmupStage: 2,
  }

  const transactionCalls: unknown[][] = []
  const mailboxSyncAdds: Array<{ name: string; data: unknown; options: unknown }> = []

  const fakePrisma = {
    mailAccount: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === 'sender-1') return sender
        if (where.id === 'recipient-1') {
          return {
            id: 'recipient-1',
            email: 'reply@other.com',
            displayName: 'Reply User',
            type: 'gmail',
            warmupStatus: 'WARMED',
            warmupStage: 1,
          }
        }
        return null
      },
      findMany: async () => [
        { id: 'recipient-1', email: 'peer@other.com', displayName: 'Peer User', type: 'gmail' },
      ],
      update: async (input: unknown) => input,
    },
    warmupRecipient: {
      findMany: async () => [],
    },
    warmupMailLog: {
      groupBy: async () => [],
      create: async (input: unknown) => input,
    },
    $transaction: async (operations: unknown[]) => {
      transactionCalls.push(operations)
      return operations
    },
  }

  warmupProcessorTestUtils.warmupDeps.prisma = fakePrisma as never
  warmupProcessorTestUtils.warmupDeps.mailboxSyncQueue = {
    add: async (name: string, data: unknown, options: unknown) => {
      mailboxSyncAdds.push({ name, data, options })
    },
  } as never
  warmupProcessorTestUtils.warmupDeps.sendViaGmail = async () => undefined
  warmupProcessorTestUtils.warmupDeps.random = () => 0.99
  warmupProcessorTestUtils.warmupDeps.now = () => 1_710_000_000_000

  await warmupProcessorTestUtils.processWarmupJob({
    data: { mailAccountId: 'sender-1' },
  } as never)

  assert.equal(transactionCalls.length, 1)
  assert.equal(mailboxSyncAdds.length, 1)
  assert.deepEqual(mailboxSyncAdds[0], {
    name: 'sync-mailbox',
    data: { mailAccountId: 'sender-1', reason: 'post-send' },
    options: { jobId: 'mailbox-post-warmup-sender-1-1710000000000' },
  })
})

test('processWarmupJob pauses warmup when Gmail auth needs reconnecting', async () => {
  const sender = {
    id: 'sender-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    type: 'gmail',
    warmupAutoEnabled: true,
    warmupStatus: 'WARMING',
    recommendedDailyLimit: 20,
    sentToday: 1,
    lastMailSentAt: null,
    warmupStage: 2,
  }

  const mailAccountUpdates: unknown[] = []
  const warmupLogCreates: unknown[] = []

  const fakePrisma = {
    mailAccount: {
      findUnique: async () => sender,
      findMany: async () => [
        { id: 'recipient-1', email: 'peer@other.com', displayName: 'Peer User', type: 'gmail' },
      ],
      update: async (input: unknown) => {
        mailAccountUpdates.push(input)
        return input
      },
    },
    warmupRecipient: {
      findMany: async () => [],
    },
    warmupMailLog: {
      groupBy: async () => [],
      create: async (input: unknown) => {
        warmupLogCreates.push(input)
        return input
      },
    },
    $transaction: async (operations: unknown[]) => operations,
  }

  warmupProcessorTestUtils.warmupDeps.prisma = fakePrisma as never
  warmupProcessorTestUtils.warmupDeps.sendViaGmail = async () => {
    throw new Error('invalid_grant: refresh token invalid')
  }
  warmupProcessorTestUtils.warmupDeps.random = () => 0.99

  await warmupProcessorTestUtils.processWarmupJob({
    data: { mailAccountId: 'sender-1' },
  } as never)

  assert.equal(warmupLogCreates.length, 1)
  assert.equal(mailAccountUpdates.length, 1)
  const firstUpdate = mailAccountUpdates[0] as {
    where: { id: string }
    data: { warmupStatus: string; warmupPausedAt: Date; warmupAutoEnabled: boolean }
  }
  assert.deepEqual(mailAccountUpdates[0], {
    where: { id: 'sender-1' },
    data: {
      warmupStatus: 'PAUSED',
      warmupPausedAt: firstUpdate.data.warmupPausedAt,
      warmupAutoEnabled: false,
    },
  })
})

test('processWarmupJob performs the full system-recipient send and reply flow', async () => {
  const sender = {
    id: 'sender-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    type: 'gmail',
    warmupAutoEnabled: true,
    warmupStatus: 'WARMING',
    recommendedDailyLimit: 20,
    sentToday: 1,
    lastMailSentAt: null,
    warmupStage: 2,
  }
  const replier = {
    id: 'recipient-1',
    email: 'peer@other.com',
    displayName: 'Peer User',
    type: 'gmail',
    warmupStatus: 'WARMED',
    warmupStage: 4,
  }

  const sendCalls: Array<{ from: string; to: string; subject: string }> = []
  const transactions: unknown[][] = []
  const queueAdds: Array<{ name: string; data: unknown; options: unknown }> = []

  const fakePrisma = {
    mailAccount: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === sender.id) return sender
        if (where.id === replier.id) return replier
        return null
      },
      findMany: async () => [
        { id: replier.id, email: replier.email, displayName: replier.displayName, type: replier.type },
      ],
      update: async (input: unknown) => input,
    },
    warmupRecipient: {
      findMany: async () => [],
    },
    warmupMailLog: {
      groupBy: async () => [],
      create: async (input: unknown) => input,
    },
    $transaction: async (operations: unknown[]) => {
      transactions.push(operations)
      return operations
    },
  }

  warmupProcessorTestUtils.warmupDeps.prisma = fakePrisma as never
  warmupProcessorTestUtils.warmupDeps.mailboxSyncQueue = {
    add: async (name: string, data: unknown, options: unknown) => {
      queueAdds.push({ name, data, options })
    },
  } as never
  warmupProcessorTestUtils.warmupDeps.sendViaGmail = async (
    mailAccountId: string,
    to: string,
    subject: string,
  ) => {
    sendCalls.push({ from: mailAccountId, to, subject })
  }
  warmupProcessorTestUtils.warmupDeps.random = () => 0.1
  warmupProcessorTestUtils.warmupDeps.now = () => 1_710_000_000_000

  await warmupProcessorTestUtils.processWarmupJob({
    data: { mailAccountId: sender.id },
  } as never)

  assert.equal(sendCalls.length, 2)
  assert.deepEqual(sendCalls.map((call) => ({ from: call.from, to: call.to })), [
    { from: sender.id, to: replier.email },
    { from: replier.id, to: sender.email },
  ])
  assert.equal(transactions.length, 2)
  assert.equal(queueAdds.length, 2)
})

test('processWarmupJob skips when sender hit daily limit', async () => {
  const sender = {
    id: 'sender-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    type: 'gmail',
    warmupAutoEnabled: true,
    warmupStatus: 'WARMING',
    recommendedDailyLimit: 5,
    sentToday: 5,
    lastMailSentAt: null,
    warmupStage: 2,
  }

  let sendAttempted = false

  warmupProcessorTestUtils.warmupDeps.prisma = {
    mailAccount: {
      findUnique: async () => sender,
    },
  } as never
  warmupProcessorTestUtils.warmupDeps.sendViaGmail = async () => {
    sendAttempted = true
  }

  await warmupProcessorTestUtils.processWarmupJob({
    data: { mailAccountId: sender.id },
  } as never)

  assert.equal(sendAttempted, false)
})

test('processWarmupJob skips when cooldown window is still active', async () => {
  const sender = {
    id: 'sender-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    type: 'gmail',
    warmupAutoEnabled: true,
    warmupStatus: 'WARMING',
    recommendedDailyLimit: 20,
    sentToday: 1,
    lastMailSentAt: new Date(1_710_000_000_000 - 60_000),
    warmupStage: 2,
  }

  let sendAttempted = false

  warmupProcessorTestUtils.warmupDeps.prisma = {
    mailAccount: {
      findUnique: async () => sender,
    },
  } as never
  warmupProcessorTestUtils.warmupDeps.sendViaGmail = async () => {
    sendAttempted = true
  }
  warmupProcessorTestUtils.warmupDeps.now = () => 1_710_000_000_000

  await warmupProcessorTestUtils.processWarmupJob({
    data: { mailAccountId: sender.id },
  } as never)

  assert.equal(sendAttempted, false)
})
