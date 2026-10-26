import type { SolanaOpenPayload } from "./types";

export const canonicalSolanaPayload = {
  spaceId: "0x00000000000000000000000000000001",
  chainObjectId: "690000000000000000000067",
  chainId: "67",
  chainType: "SOL",
  address: "HzHnZAue9fx2aCmFowxAx57PPPCtZzQ65vhCbWbeKvM8",
  programId: "Gx82CdkxU4X6HYiXJXY5MUwAWUfwYbA13Q1Jbobg9Fst",
  creator: `0x${"11".repeat(32)}`,
  digest: `0x${"ab".repeat(32)}`,
  config: "AAAAAGk=",
  validAfter: 1_790_000_000,
  validUntil: 1_790_000_300,
  guardian: `0x${"22".repeat(32)}`,
  owner: `0x${"11".repeat(32)}`,
  members: [`0x${"11".repeat(32)}`, `0x${"33".repeat(32)}`],
} satisfies SolanaOpenPayload;
