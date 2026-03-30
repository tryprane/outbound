import test from 'node:test'
import assert from 'node:assert/strict'

import { inferZohoImapHost, isZohoImapDisabledError } from '~/lib/mailboxProviders/zohoMailboxProvider'

test('inferZohoImapHost follows the SMTP region', () => {
  assert.equal(inferZohoImapHost('smtp.zoho.in'), 'imap.zoho.in')
  assert.equal(inferZohoImapHost('smtp.zoho.eu'), 'imap.zoho.eu')
  assert.equal(inferZohoImapHost('smtp.zoho.com'), 'imap.zoho.com')
  assert.equal(inferZohoImapHost(undefined), 'imap.zoho.com')
})

test('isZohoImapDisabledError recognizes the Zoho IMAP alert', () => {
  assert.equal(
    isZohoImapDisabledError({
      response: '3 NO [ALERT] You are yet to enable IMAP for your account. Please contact your administrator (Failure)',
    }),
    true
  )
  assert.equal(isZohoImapDisabledError(new Error('Command failed')), false)
})
