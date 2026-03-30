import { promises as dns } from 'dns'
import { getRedis } from '@/lib/redis'

export type DomainProviderHint = 'gmail' | 'zoho' | 'unknown'

export interface DomainDiagnostics {
  domain: string
  providerHint: DomainProviderHint
  checkedAt: string
  mxHosts: string[]
  mxIps: string[]
  spf: {
    found: boolean
    valid: boolean
    record: string | null
    providerAligned: boolean
  }
  dmarc: {
    found: boolean
    valid: boolean
    record: string | null
    policy: string | null
  }
  dkim: {
    foundSelectors: string[]
    checkedSelectors: string[]
    providerAligned: boolean
  }
  blacklist: {
    checked: boolean
    listedOn: string[]
    checkedZones: string[]
  }
  riskScore: number
  severity: 'ok' | 'warning' | 'critical'
  recommendedAction: string
  warnings: string[]
}

const CACHE_TTL_SECONDS = 6 * 60 * 60
const DNSBL_ZONES = ['zen.spamhaus.org', 'bl.spamcop.net', 'dnsbl.sorbs.net']

function cacheKey(domain: string, providerHint: DomainProviderHint) {
  return `domain-diagnostics:${providerHint}:${domain}`
}

function normalizeTxt(records: string[][]): string[] {
  return records.map((parts) => parts.join(''))
}

function inferPolicy(record: string | null) {
  if (!record) return null
  const match = record.match(/\bp=([a-z]+)/i)
  return match?.[1]?.toLowerCase() || null
}

function defaultSelectors(providerHint: DomainProviderHint) {
  switch (providerHint) {
    case 'gmail':
      return ['google', 'google2', 'googlemail']
    case 'zoho':
      return ['zohomail', 'zoho', 'zm']
    default:
      return ['google', 'zohomail']
  }
}

function providerSignals(providerHint: DomainProviderHint) {
  if (providerHint === 'gmail') {
    return {
      spfIncludes: ['_spf.google.com', 'spf.google.com'],
      mxHints: ['google.com', 'googlemail.com'],
      dkimSelectors: defaultSelectors('gmail'),
    }
  }
  if (providerHint === 'zoho') {
    return {
      spfIncludes: ['zoho.com', 'zoho.eu', 'zoho.in'],
      mxHints: ['zoho.com', 'zoho.eu', 'zoho.in'],
      dkimSelectors: defaultSelectors('zoho'),
    }
  }
  return {
    spfIncludes: ['_spf.google.com', 'zoho.com'],
    mxHints: ['google.com', 'zoho.com'],
    dkimSelectors: defaultSelectors('unknown'),
  }
}

async function resolveTxtSafe(name: string) {
  try {
    return normalizeTxt(await dns.resolveTxt(name))
  } catch {
    return []
  }
}

async function resolveMxSafe(name: string) {
  try {
    const records = await dns.resolveMx(name)
    return records.sort((a, b) => a.priority - b.priority).map((item) => item.exchange.toLowerCase())
  } catch {
    return []
  }
}

async function resolveIpv4Safe(name: string) {
  try {
    return await dns.resolve4(name)
  } catch {
    return []
  }
}

function reverseIpv4(ip: string) {
  return ip.split('.').reverse().join('.')
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let handle: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        handle = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } finally {
    if (handle) clearTimeout(handle)
  }
}

async function checkDnsbl(ip: string, zone: string) {
  const query = `${reverseIpv4(ip)}.${zone}`
  const records = await withTimeout(resolveIpv4Safe(query), 1_500, [])
  return records.length > 0
}

function buildRecommendedAction(params: {
  warnings: string[]
  listedOn: string[]
  dmarcPolicy: string | null
  dkimAligned: boolean
  spfAligned: boolean
}) {
  if (params.listedOn.length > 0) {
    return `Investigate blacklist listings on ${params.listedOn.join(', ')} before using this domain for outreach.`
  }
  if (!params.spfAligned || !params.dkimAligned) {
    return 'Fix SPF and DKIM alignment before scaling warmup or outreach.'
  }
  if (!params.dmarcPolicy || params.dmarcPolicy === 'none') {
    return 'Publish an enforcing DMARC policy after SPF and DKIM are healthy.'
  }
  if (params.warnings.length > 0) {
    return 'Review DNS warnings and clear them before increasing volume.'
  }
  return 'Domain looks healthy for controlled warmup and outreach.'
}

export function getDomainDiagnosticsBlockers(diagnostics: DomainDiagnostics): string[] {
  const blockers: string[] = []
  if (diagnostics.blacklist.listedOn.length > 0) {
    blockers.push(`MX IP listed on ${diagnostics.blacklist.listedOn.join(', ')}`)
  }
  if (!diagnostics.spf.found || !diagnostics.spf.providerAligned) {
    blockers.push('SPF is missing or not aligned')
  }
  if (!diagnostics.dkim.providerAligned) {
    blockers.push('DKIM is missing or not aligned')
  }
  if (diagnostics.mxHosts.length === 0) {
    blockers.push('MX records are missing')
  }
  return blockers
}

async function buildDomainDiagnostics(domain: string, providerHint: DomainProviderHint): Promise<DomainDiagnostics> {
  const normalizedDomain = domain.trim().toLowerCase()
  const signals = providerSignals(providerHint)
  const [rootTxt, dmarcTxt, mxHosts] = await Promise.all([
    resolveTxtSafe(normalizedDomain),
    resolveTxtSafe(`_dmarc.${normalizedDomain}`),
    resolveMxSafe(normalizedDomain),
  ])
  const mxIps = Array.from(
    new Set(
      (
        await Promise.all(
          mxHosts.slice(0, 4).map(async (host) => resolveIpv4Safe(host))
        )
      ).flat()
    )
  ).slice(0, 6)

  const spfRecord = rootTxt.find((record) => /^v=spf1\b/i.test(record)) || null
  const dmarcRecord = dmarcTxt.find((record) => /^v=dmarc1\b/i.test(record)) || null
  const checkedSelectors = signals.dkimSelectors
  const selectorChecks = await Promise.all(
    checkedSelectors.map(async (selector) => ({
      selector,
      records: await resolveTxtSafe(`${selector}._domainkey.${normalizedDomain}`),
    }))
  )
  const foundSelectors = selectorChecks
    .filter((item) => item.records.some((record) => /v=dkim1/i.test(record)))
    .map((item) => item.selector)

  const spfAligned = Boolean(
    spfRecord &&
    signals.spfIncludes.some((include) => spfRecord.toLowerCase().includes(include))
  )
  const mxAligned = mxHosts.some((host) => signals.mxHints.some((hint) => host.includes(hint)))
  const dkimAligned = foundSelectors.length > 0
  const blacklistChecks = await Promise.all(
    mxIps.flatMap((ip) =>
      DNSBL_ZONES.map(async (zone) => ({
        zone,
        listed: await checkDnsbl(ip, zone),
      }))
    )
  )
  const listedOn = blacklistChecks.filter((item) => item.listed).map((item) => item.zone)

  const warnings: string[] = []
  if (!spfRecord) warnings.push('No SPF record found')
  else if (!spfAligned) warnings.push(`SPF record does not look aligned for ${providerHint}`)

  if (!dmarcRecord) warnings.push('No DMARC record found')
  else {
    const policy = inferPolicy(dmarcRecord)
    if (!policy || policy === 'none') {
      warnings.push('DMARC policy is not enforcing (p=none)')
    }
  }

  if (!dkimAligned) warnings.push('No provider-aligned DKIM selector detected')
  if (mxHosts.length === 0) warnings.push('No MX records found')
  else if (!mxAligned) warnings.push(`MX records do not look aligned for ${providerHint}`)
  if (listedOn.length > 0) warnings.push(`MX IP appears listed on ${listedOn.join(', ')}`)

  let riskScore = 100
  if (!spfRecord) riskScore -= 35
  else if (!spfAligned) riskScore -= 20
  if (!dmarcRecord) riskScore -= 20
  else {
    const policy = inferPolicy(dmarcRecord)
    if (!policy || policy === 'none') riskScore -= 10
  }
  if (!dkimAligned) riskScore -= 25
  if (mxHosts.length === 0) riskScore -= 20
  else if (!mxAligned) riskScore -= 15
  if (listedOn.length > 0) riskScore -= 50
  riskScore = Math.max(0, riskScore)
  const severity: DomainDiagnostics['severity'] =
    listedOn.length > 0 || riskScore < 45 ? 'critical' : warnings.length > 0 ? 'warning' : 'ok'
  const recommendedAction = buildRecommendedAction({
    warnings,
    listedOn,
    dmarcPolicy: inferPolicy(dmarcRecord),
    dkimAligned,
    spfAligned,
  })

  return {
    domain: normalizedDomain,
    providerHint,
    checkedAt: new Date().toISOString(),
    mxHosts,
    mxIps,
    spf: {
      found: Boolean(spfRecord),
      valid: Boolean(spfRecord),
      record: spfRecord,
      providerAligned: spfAligned,
    },
    dmarc: {
      found: Boolean(dmarcRecord),
      valid: Boolean(dmarcRecord),
      record: dmarcRecord,
      policy: inferPolicy(dmarcRecord),
    },
    dkim: {
      foundSelectors,
      checkedSelectors,
      providerAligned: dkimAligned,
    },
    blacklist: {
      checked: mxIps.length > 0,
      listedOn,
      checkedZones: DNSBL_ZONES,
    },
    riskScore,
    severity,
    recommendedAction,
    warnings,
  }
}

export async function getDomainDiagnostics(domain: string, providerHint: DomainProviderHint): Promise<DomainDiagnostics> {
  const redis = getRedis()
  const key = cacheKey(domain, providerHint)
  const cached = await redis.get(key)
  if (cached) {
    return JSON.parse(cached) as DomainDiagnostics
  }

  const diagnostics = await buildDomainDiagnostics(domain, providerHint)
  await redis.set(key, JSON.stringify(diagnostics), 'EX', CACHE_TTL_SECONDS)
  return diagnostics
}
