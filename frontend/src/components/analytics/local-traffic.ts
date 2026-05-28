const LOCAL_HOSTNAMES = new Set([
  '0.0.0.0',
  '::',
  '::1',
  '127.0.0.1',
  'docker.for.mac.localhost',
  'host.docker.internal',
  'localhost',
  'localhost.localdomain',
])

const LOCAL_TLDS = ['.local', '.localhost', '.test', '.invalid']

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number)

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }

  const [first, second] = parts

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isLocalIpv6(hostname: string) {
  if (!hostname.includes(':')) return false
  if (hostname === '::' || hostname === '::1') return true

  if (hostname.startsWith('::ffff:')) {
    return isPrivateIpv4(hostname.replace('::ffff:', ''))
  }

  const firstHextet = Number.parseInt(hostname.split(':')[0], 16)

  return (
    Number.isInteger(firstHextet) &&
    ((firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
      (firstHextet >= 0xfe80 && firstHextet <= 0xfebf))
  )
}

export function isLocalAnalyticsHost(hostname: string) {
  const normalized = normalizeHostname(hostname)

  return (
    LOCAL_HOSTNAMES.has(normalized) ||
    LOCAL_TLDS.some((suffix) => normalized.endsWith(suffix)) ||
    isPrivateIpv4(normalized) ||
    isLocalIpv6(normalized)
  )
}
