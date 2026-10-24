import ipaddr from 'ipaddr.js';
export type DestinationGrant = { origin: string; addresses?: string[]; paths?: string[]; queryKeys?: string[]; bodyKeys?: string[] };
export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) return false;
    return parsed.range() === 'unicast';
  } catch { return false; }
}
export function assertDestination(url: URL, addresses: string[], grant: DestinationGrant): void {
  if (url.origin !== grant.origin || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || !addresses.length) throw new Error('REVIEW_REQUIRED');
  if (grant.queryKeys && [...url.searchParams.keys()].some(key => !grant.queryKeys!.includes(key))) throw new Error('REVIEW_REQUIRED');
  if (grant.paths && !grant.paths.includes(url.pathname)) throw new Error('REVIEW_REQUIRED');
  if (addresses.some(address => !isPublicAddress(address) && !grant.addresses?.includes(address))) throw new Error('REVIEW_REQUIRED');
  if (grant.addresses && addresses.some(address => !grant.addresses!.includes(address))) throw new Error('REVIEW_REQUIRED');
}
