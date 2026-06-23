const ALLOWED_EMAILS = new Set([
  "rainer.boehm@lautini.ch",
  "rainerboehm.slp@gmail.com",
  "t9gtc9ypxp@privaterelay.appleid.com",
  "j.boehm@me.com",
  "richardmboehm@icloud.com",
]);

const ALLOWED_DOMAINS = new Set([
  "lautini.ch",
]);

export function isClosedBetaAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (ALLOWED_EMAILS.has(lower)) return true;
  const domain = lower.split("@")[1];
  if (domain && ALLOWED_DOMAINS.has(domain)) return true;
  return false;
}
