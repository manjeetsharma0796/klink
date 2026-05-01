import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Returns a JS string to inject into puppeteer page via page.evaluateOnNewDocument.
 * Sets window.solana = a stub adapter that signs with the given secret key.
 * Mirrors only the methods the wallet-adapter actually calls.
 */
export function buildMockPhantomScript(secretKey: Uint8Array, pubkey: string): string {
  const secretBase58 = bs58.encode(secretKey);
  return `
    (function () {
      const secretKey = bs58Decode(${JSON.stringify(secretBase58)});
      const pubkey = ${JSON.stringify(pubkey)};
      function bs58Decode(s) {
        const ALPH = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let bytes = [0]; for (let i = 0; i < s.length; i++) {
          let c = ALPH.indexOf(s[i]); if (c < 0) throw new Error("bs58 char");
          for (let j = 0; j < bytes.length; j++) { c += bytes[j] * 58; bytes[j] = c & 0xff; c >>= 8; }
          while (c > 0) { bytes.push(c & 0xff); c >>= 8; }
        }
        for (let i = 0; i < s.length && s[i] === ALPH[0]; i++) bytes.push(0);
        return new Uint8Array(bytes.reverse());
      }
      window.solana = {
        isPhantom: true,
        publicKey: { toBase58: () => pubkey, toBytes: () => secretKey.slice(32) },
        connect: async () => ({ publicKey: window.solana.publicKey }),
        disconnect: async () => {},
        signMessage: async (msg) => {
          const sig = window.tweetnacl.sign.detached(msg, secretKey);
          return { signature: sig };
        },
        signTransaction: async (tx) => tx, // round-trip; e2e doesn't submit
        on: () => {}, off: () => {}, removeListener: () => {},
      };
    })();
  `;
}

/** Helper for the e2e file — puts tweetnacl on window for the mock to use. */
export const TWEETNACL_INJECTION = `window.tweetnacl = require("tweetnacl");`;
