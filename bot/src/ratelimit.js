// Pure rate-limit decision. The Worker supplies counts read from KV.
export const LIMITS = { perUserDaily: 60, globalDaily: 200 };

export function decideLimit({ userCount, globalCount }, limits = LIMITS) {
  if (globalCount >= limits.globalDaily) return { allowed: false, reason: 'global' };
  if (userCount >= limits.perUserDaily) return { allowed: false, reason: 'user' };
  return { allowed: true };
}
