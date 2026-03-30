import test from 'node:test'
import assert from 'node:assert/strict'

import type { CampaignEligibleMailAccount } from '~/lib/campaignGuardrails'
import { cronSchedulerTestUtils } from '~/scheduler/cronScheduler'

function makeAccount(overrides: Partial<CampaignEligibleMailAccount> = {}): CampaignEligibleMailAccount {
  return {
    id: 'acc-1',
    email: 'sender@example.com',
    type: 'gmail',
    isActive: true,
    warmupStatus: 'WARMED',
    mailboxHealthStatus: 'healthy',
    mailboxHealthScore: 88,
    mailboxSyncStatus: 'idle',
    ...overrides,
  }
}

test('recommendedLimitFromStage clamps to the warmup plan edges', () => {
  assert.equal(cronSchedulerTestUtils.recommendedLimitFromStage(-5), 5)
  assert.equal(cronSchedulerTestUtils.recommendedLimitFromStage(2), 20)
  assert.equal(cronSchedulerTestUtils.recommendedLimitFromStage(99), 75)
})

test('summarizeMailboxHealthStatus honors paused warmup state', () => {
  assert.equal(
    cronSchedulerTestUtils.summarizeMailboxHealthStatus(
      makeAccount({ warmupStatus: 'PAUSED', mailboxHealthStatus: 'warming' })
    ),
    'paused'
  )
  assert.equal(
    cronSchedulerTestUtils.summarizeMailboxHealthStatus(
      makeAccount({ mailboxHealthStatus: 'at_risk' })
    ),
    'at_risk'
  )
})

test('assessCampaignDomainRisk blocks campaigns with no eligible mailboxes', () => {
  const reason = cronSchedulerTestUtils.assessCampaignDomainRisk([
    makeAccount({ warmupStatus: 'WARMING' }),
  ])

  assert.equal(reason, 'No healthy eligible sender remains assigned to this campaign.')
})

test('assessCampaignDomainRisk flags delivery reputation problems by provider-domain', () => {
  const reason = cronSchedulerTestUtils.assessCampaignDomainRisk(
    [makeAccount(), makeAccount({ id: 'acc-2', email: 'other@example.com' })],
    new Map([['gmail:example.com', { total: 10, failed: 1, bounced: 2 }]])
  )

  assert.equal(reason, 'Recent delivery reputation is weak for example.com (20% bounce, 30% failure).')
})

test('assessCampaignDomainRisk flags recent complaint spikes', () => {
  const reason = cronSchedulerTestUtils.assessCampaignDomainRisk(
    [makeAccount()],
    undefined,
    new Map([['gmail:example.com', 2]])
  )

  assert.equal(reason, 'Recent recipient complaints detected for example.com (2 complaints in 14d).')
})

test('assessCampaignDomainRisk returns null for healthy campaign coverage', () => {
  const reason = cronSchedulerTestUtils.assessCampaignDomainRisk(
    [makeAccount(), makeAccount({ id: 'acc-2', email: 'peer@other.com', type: 'zoho' })],
    new Map([
      ['gmail:example.com', { total: 4, failed: 0, bounced: 0 }],
      ['zoho:other.com', { total: 4, failed: 0, bounced: 0 }],
    ]),
    new Map()
  )

  assert.equal(reason, null)
})

test('computeWarmupProgression promotes stage when recent warmup delivery is strong', () => {
  const result = cronSchedulerTestUtils.computeWarmupProgression({
    warmupStage: 2,
    recommendedDailyLimit: 20,
    logs: [
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'failed' },
    ],
  })

  assert.deepEqual(result, {
    nextStage: 3,
    warmed: false,
    recommendedDailyLimit: 35,
  })
})

test('computeWarmupProgression demotes stage when failures are heavy', () => {
  const result = cronSchedulerTestUtils.computeWarmupProgression({
    warmupStage: 3,
    recommendedDailyLimit: 35,
    logs: [
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'sent' },
      { status: 'failed' },
      { status: 'failed' },
      { status: 'failed' },
      { status: 'failed' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'bounced' },
      { status: 'sent' },
    ],
  })

  assert.deepEqual(result, {
    nextStage: 2,
    warmed: false,
    recommendedDailyLimit: 20,
  })
})

test('computeWarmupProgression marks mailbox warmed at final stage', () => {
  const result = cronSchedulerTestUtils.computeWarmupProgression({
    warmupStage: 4,
    recommendedDailyLimit: 50,
    logs: new Array(30).fill({ status: 'sent' }),
  })

  assert.deepEqual(result, {
    nextStage: 5,
    warmed: true,
    recommendedDailyLimit: 75,
  })
})
