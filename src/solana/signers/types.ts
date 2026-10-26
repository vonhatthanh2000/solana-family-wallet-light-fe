export interface RawEd25519Signer {
  readonly address: string;
  readonly provider: string;
  publicKeyBytes(): Uint8Array;
  signDigest32(digest: Uint8Array): Promise<Uint8Array>;
}

export type ConnectedSigner = RawEd25519Signer & {
  readonly canSignDigest: boolean;
};
