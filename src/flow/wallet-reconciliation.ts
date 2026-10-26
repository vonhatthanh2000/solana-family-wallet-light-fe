import {
  getChains as getChainsRequest,
  getWalletGroups as getWalletGroupsRequest,
  getWallets as getWalletsRequest,
  createSpace as createSpaceRequest,
  registerWallet as registerWalletRequest,
  type RegisterWalletInput,
} from "../api/endpoints";
import type {
  ChainListResponse,
  CreateSpaceResponse,
  WalletDto,
  WalletGroupDto,
} from "../api/types";
import {
  planSolanaWalletRegistration,
  requireEffectiveSolanaWallet,
} from "./wallet-selection";

type ReconciliationDependencies = {
  getChains(): Promise<ChainListResponse>;
  getWalletGroups(): Promise<WalletGroupDto[]>;
  getWallets(chainId: string): Promise<WalletDto[]>;
  registerWallet(input: RegisterWalletInput): Promise<WalletDto>;
  verifyTonPublicKey(
    publicKey: string,
    address: string,
    network: string,
  ): string | Promise<string>;
};

const defaultDependencies: ReconciliationDependencies = {
  getChains: getChainsRequest,
  getWalletGroups: getWalletGroupsRequest,
  getWallets: getWalletsRequest,
  registerWallet: registerWalletRequest,
  verifyTonPublicKey: async (publicKey, address, network) => {
    const { verifiedTonPublicKeyInBrowser } = await import(
      "../ton/browser-wallet-public-key"
    );
    return verifiedTonPublicKeyInBrowser(publicKey, address, network);
  },
};

type SpaceCreationDependencies = ReconciliationDependencies & {
  createSpace(name: string): Promise<CreateSpaceResponse>;
};

const defaultSpaceCreationDependencies: SpaceCreationDependencies = {
  ...defaultDependencies,
  createSpace: createSpaceRequest,
};

export type EffectiveWalletContext = {
  tonChain: ChainListResponse["items"][number];
  solanaChain: ChainListResponse["items"][number];
  tonWallet: WalletDto;
  solanaWallet: WalletDto;
  walletGroups: WalletGroupDto[];
  walletGroup: WalletGroupDto;
};

export class WalletReconciliationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WalletReconciliationError";
  }
}

export async function reconcileEffectiveWallets(
  input: {
    connectedAddress: string;
    expectedNetwork: string;
    allowRegistration: boolean;
  },
  dependencies: ReconciliationDependencies = defaultDependencies,
): Promise<EffectiveWalletContext> {
  const chains = await dependencies.getChains();
  const tonChain = chains.items.find(
    (chain) =>
      chain.chainType === "TON" &&
      chain.network === input.expectedNetwork &&
      chain.isActive,
  );
  const solanaChain = chains.items.find(
    (chain) =>
      chain.chainType === "SOL" &&
      chain.network === input.expectedNetwork &&
      chain.isActive,
  );
  if (!tonChain) {
    throw new Error(`No active TON ${input.expectedNetwork} chain was returned`);
  }
  if (!solanaChain) {
    throw new Error(`No active Solana ${input.expectedNetwork} chain was returned`);
  }

  const [walletGroups, tonWallets, solanaWallets] = await Promise.all([
    dependencies.getWalletGroups(),
    dependencies.getWallets(tonChain._id),
    dependencies.getWallets(solanaChain._id),
  ]);
  const plan = planSolanaWalletRegistration({
    tonWallets,
    solanaWallets,
    connectedAddress: input.connectedAddress,
  });
  if (plan.kind === "blocked") throw new Error(plan.message);
  if (!plan.tonWallet.publicKey) {
    throw new Error("Backend-effective TON wallet public key is missing");
  }
  await dependencies.verifyTonPublicKey(
    plan.tonWallet.publicKey,
    plan.tonWallet.address,
    tonChain.network,
  );
  const walletGroup = walletGroups.find(
    (group) => group.walletIndex === plan.preferredIndex,
  );
  if (!walletGroup) {
    throw new Error(`Wallet group for backend-effective index ${plan.preferredIndex} was not found`);
  }

  if (plan.kind === "reuse") {
    return {
      tonChain,
      solanaChain,
      tonWallet: plan.tonWallet as WalletDto,
      solanaWallet: plan.wallet as WalletDto,
      walletGroups,
      walletGroup,
    };
  }
  if (!input.allowRegistration) {
    throw new Error(
      `Connected Solana account ${input.connectedAddress} is not backend-effective. ` +
      "Register and reconcile it before creating a Space.",
    );
  }

  const registered = await dependencies.registerWallet({
    chainId: solanaChain._id,
    address: input.connectedAddress,
    publicKey: input.connectedAddress,
    walletIndex: plan.preferredIndex,
  });
  if (registered.address !== input.connectedAddress) {
    throw new Error(
      `Wallet registration returned ${registered.address}, not connected account ` +
      `${input.connectedAddress}. The preferred index is occupied.`,
    );
  }
  const reloadedSolanaWallets = await dependencies.getWallets(solanaChain._id);
  const solanaWallet = requireEffectiveSolanaWallet(
    reloadedSolanaWallets,
    input.connectedAddress,
  ) as WalletDto;

  return {
    tonChain,
    solanaChain,
    tonWallet: plan.tonWallet as WalletDto,
    solanaWallet,
    walletGroups,
    walletGroup,
  };
}

export async function createSpaceWithEffectiveWallet(
  input: {
    name: string;
    connectedAddress: string;
    expectedNetwork: string;
  },
  dependencies: SpaceCreationDependencies = defaultSpaceCreationDependencies,
): Promise<{ context: EffectiveWalletContext; response: CreateSpaceResponse }> {
  let context: EffectiveWalletContext;
  try {
    context = await reconcileEffectiveWallets(
      {
        connectedAddress: input.connectedAddress,
        expectedNetwork: input.expectedNetwork,
        allowRegistration: false,
      },
      dependencies,
    );
  } catch (error) {
    throw new WalletReconciliationError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
  const response = await dependencies.createSpace(input.name);
  return { context, response };
}
