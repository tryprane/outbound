import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { prisma } from '~/lib/prisma'
import { mailboxSyncProcessorTestUtils } from '~/processors/mailboxSyncProcessor'

const originalWarmupFindUnique = prisma.warmupRecipient.findUnique
const originalMailAccountFindUnique = prisma.mailAccount.findUnique

afterEach(() => {
  prisma.warmupRecipient.findUnique = originalWarmupFindUnique
  prisma.mailAccount.findUnique = originalMailAccountFindUnique
})

test('detectWarmup returns true for configured warmup recipients', async () => {
  prisma.warmupRecipient.findUnique = (async () => ({ email: 'peer@other.com' })) as never
  prisma.mailAccount.findUnique = (async () => null) as never

  const isWarmup = await mailboxSyncProcessorTestUtils.detectWarmup('sender-1', {
    direction: 'outbound',
    toEmail: 'peer@other.com',
  } as never)

  assert.equal(isWarmup, true)
})

test('detectWarmup returns true for sibling mailboxes and false for self-mail', async () => {
  prisma.warmupRecipient.findUnique = (async () => null) as never
  prisma.mailAccount.findUnique = (async ({ where }: { where: { email: string } }) => {
    if (where.email === 'peer@other.com') return { id: 'other-mailbox' }
    if (where.email === 'self@example.com') return { id: 'sender-1' }
    return null
  }) as never

  const siblingResult = await mailboxSyncProcessorTestUtils.detectWarmup('sender-1', {
    direction: 'inbound',
    fromEmail: 'peer@other.com',
  } as never)
  const selfResult = await mailboxSyncProcessorTestUtils.detectWarmup('sender-1', {
    direction: 'inbound',
    fromEmail: 'self@example.com',
  } as never)

  assert.equal(siblingResult, true)
  assert.equal(selfResult, false)
})

test('calculateHealth scores inbox placement, engagement, and rescue activity', () => {
  const health = mailboxSyncProcessorTestUtils.calculateHealth([
    {
      direction: 'inbound',
      folderKind: 'INBOX',
      isRead: true,
      openedAt: new Date(),
      repliedAt: new Date(),
      rescuedAt: null,
      isWarmup: true,
    },
    {
      direction: 'inbound',
      folderKind: 'SPAM',
      isRead: false,
      openedAt: null,
      repliedAt: null,
      rescuedAt: new Date(),
      isWarmup: true,
    },
    {
      direction: 'outbound',
      folderKind: 'SENT',
      isRead: true,
      openedAt: null,
      repliedAt: null,
      rescuedAt: null,
      isWarmup: true,
    },
  ])

  assert.equal(health.healthScore, 55)
  assert.equal(health.healthStatus, 'warming')
  assert.equal(health.sentCount, 1)
  assert.equal(health.receivedCount, 2)
  assert.equal(health.rescuedCount, 1)
})

test('deriveWarmupAutomation auto-pauses unhealthy active warmup', () => {
  const decision = mailboxSyncProcessorTestUtils.deriveWarmupAutomation(
    {
      warmupStatus: 'WARMING',
      warmupAutoEnabled: true,
      recommendedDailyLimit: 40,
      mailboxSyncError: null,
    },
    {
      healthScore: 20,
      healthStatus: 'at_risk',
      inboxRate: 0,
      spamRate: 1,
      readRate: 0,
      replyRate: 0,
      rescueRate: 0,
      sentCount: 3,
      receivedCount: 3,
      rescuedCount: 0,
    }
  )

  assert.equal(decision.note, 'Auto-paused warmup because mailbox health dropped to 20')
  assert.equal(decision.decisions['warmupStatus'], 'PAUSED')
  assert.equal(decision.decisions['isActive'], false)
  assert.equal(decision.decisions['recommendedDailyLimit'], 20)
})

test('deriveWarmupAutomation resumes paused warmup after recovery', () => {
  const decision = mailboxSyncProcessorTestUtils.deriveWarmupAutomation(
    {
      warmupStatus: 'PAUSED',
      warmupAutoEnabled: true,
      recommendedDailyLimit: 8,
      mailboxSyncError: null,
    },
    {
      healthScore: 80,
      healthStatus: 'healthy',
      inboxRate: 1,
      spamRate: 0,
      readRate: 1,
      replyRate: 1,
      rescueRate: 0,
      sentCount: 4,
      receivedCount: 3,
      rescuedCount: 0,
    }
  )

  assert.equal(decision.note, 'Auto-resumed warmup because mailbox health recovered to 80')
  assert.equal(decision.decisions['warmupStatus'], 'WARMING')
  assert.equal(decision.decisions['recommendedDailyLimit'], 10)
})

test('deriveWarmupAutomation reduces pace when health softens', () => {
  const decision = mailboxSyncProcessorTestUtils.deriveWarmupAutomation(
    {
      warmupStatus: 'WARMING',
      warmupAutoEnabled: true,
      recommendedDailyLimit: 25,
      mailboxSyncError: null,
    },
    {
      healthScore: 50,
      healthStatus: 'at_risk',
      inboxRate: 0.5,
      spamRate: 0.5,
      readRate: 0.5,
      replyRate: 0,
      rescueRate: 0,
      sentCount: 5,
      receivedCount: 2,
      rescuedCount: 0,
    }
  )

  assert.equal(decision.note, 'Reduced warmup pace because mailbox health is 50')
  assert.equal(decision.decisions['recommendedDailyLimit'], 20)
})

test('shouldSkipMailboxSync skips Gmail accounts awaiting scope reconnect', () => {
  assert.equal(
    mailboxSyncProcessorTestUtils.shouldSkipMailboxSync({
      type: 'gmail',
      mailboxSyncError: 'Reconnect Gmail account to grant mailbox sync permissions',
    }),
    true
  )

  assert.equal(
    mailboxSyncProcessorTestUtils.shouldSkipMailboxSync({
      type: 'zoho',
      mailboxSyncError: 'Reconnect Gmail account to grant mailbox sync permissions',
    }),
    false
  )

  assert.equal(
    mailboxSyncProcessorTestUtils.shouldSkipMailboxSync({
      type: 'gmail',
      mailboxSyncError: 'Some other error',
    }),
    false
  )

  assert.equal(
    mailboxSyncProcessorTestUtils.shouldSkipMailboxSync({
      type: 'zoho',
      mailboxSyncError: 'Enable IMAP for this Zoho mailbox, then retry mailbox sync',
    }),
    true
  )
})
