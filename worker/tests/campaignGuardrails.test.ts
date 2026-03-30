import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateMailAccountGuardrail,
  extractEmailDomain,
  providerHintFromType,
} from '~/lib/campaignGuardrails'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'

function makeAccount(overrides: Partial<Parameters<typeof evaluateMailAccountGuardrail>[0]> = {}) {
  return {
    id: 'acc-1',
    email: 'sender@example.com',
    type: 'gmail',
    isActive: true,
    warmupStatus: 'WARMED' as const,
    mailboxHealthStatus: 'healthy',
    mailboxHealthScore: 82,
    mailboxSyncStatus: 'idle',
    ...overrides,
  }
}

test('extractEmailDomain normalizes valid emails', () => {
  assert.equal(extractEmailDomain('User@Example.COM '), 'example.com')
  assert.equal(extractEmailDomain(null), null)
})

test('providerHintFromType maps supported and unknown providers', () => {
  assert.equal(providerHintFromType('gmail'), 'gmail')
  assert.equal(providerHintFromType('zoho'), 'zoho')
  assert.equal(providerHintFromType('smtp'), 'unknown')
})

test('evaluateMailAccountGuardrail rejects non-warmed mailboxes', () => {
  const result = evaluateMailAccountGuardrail(makeAccount({ warmupStatus: 'WARMING' }))
  assert.deepEqual(result, {
    eligible: false,
    reason: 'Mailbox warmup is not complete',
  })
})

test('evaluateMailAccountGuardrail rejects weak mailbox health score', () => {
  const result = evaluateMailAccountGuardrail(
    makeAccount({ mailboxHealthStatus: 'warming', mailboxHealthScore: 42 })
  )
  assert.deepEqual(result, {
    eligible: false,
    reason: 'Mailbox health score is 42',
  })
})

test('evaluateMailAccountGuardrail accepts healthy warmed mailbox', () => {
  assert.deepEqual(evaluateMailAccountGuardrail(makeAccount()), {
    eligible: true,
    reason: null,
  })
})

test('getWorkerConcurrency reads the warmup-specific env override', () => {
  const previous = process.env.WARMUP_WORKER_CONCURRENCY
  process.env.WARMUP_WORKER_CONCURRENCY = '4'

  try {
    assert.equal(getWorkerConcurrency('warmup'), 4)
  } finally {
    if (previous === undefined) delete process.env.WARMUP_WORKER_CONCURRENCY
    else process.env.WARMUP_WORKER_CONCURRENCY = previous
  }
})

test('getWorkerConcurrency falls back for invalid values', () => {
  const previous = process.env.WARMUP_WORKER_CONCURRENCY
  process.env.WARMUP_WORKER_CONCURRENCY = '0'

  try {
    assert.equal(getWorkerConcurrency('warmup'), 1)
  } finally {
    if (previous === undefined) delete process.env.WARMUP_WORKER_CONCURRENCY
    else process.env.WARMUP_WORKER_CONCURRENCY = previous
  }
})
