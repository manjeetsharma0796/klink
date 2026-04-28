// Mirror of `siwsMessage` in apps/api/src/auth/siws.ts. Both sides MUST format
// identically — drift here means signatures won't verify.
const APP_NAME = "klink";

export function siwsMessage(nonce: string): string {
  return `Sign in to ${APP_NAME}: ${nonce}`;
}
