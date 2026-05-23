export type LoadState = "loading" | "loaded" | "failed" | "stale";

export interface RedeemQueueItem {
  sender: `0x${string}`;
  receiver: `0x${string}`;
  shares: bigint;
  assets: bigint;
  readyTimestamp: number;
  proxyAddress: `0x${string}`;
  claimable: boolean;
  queue: "active" | "candidate";
}

export interface ProxySnapshot {
  address: `0x${string}`;
  status: string;
  statusCode: number;
  governanceConsistent: boolean;
  staked: bigint;
  pendingUnstake: bigint;
  outstandingWithdraw: bigint;
  outstandingRewards: bigint;
  unstakeReadyTime: number;
  stakePaused: boolean;
  withdrawPaused: boolean;
  requestUnstakePaused: boolean;
  executeUnstakePaused: boolean;
  committedCurrentRound: boolean;
  revealedCurrentRound: boolean;
  lastCommitRoundId: number | null;
  lastRevealRoundId: number | null;
}

export interface VaultSnapshot {
  blockNumber: bigint;
  updatedAt: Date;
  vault: `0x${string}`;
  shareToken: `0x${string}`;
  uma: `0x${string}`;
  votingV2: `0x${string}`;
  owner: `0x${string}`;
  feeRecipient: `0x${string}`;
  upgradeTimelock: `0x${string}`;
  /** manager() on proxies[0], if any */
  firstProxyManager: `0x${string}` | null;
  systemGovernanceOk: boolean;
  shareGovernanceOk: boolean;
  depositPaused: boolean;
  redeemPaused: boolean;
  claimPaused: boolean;
  totalAssets: bigint;
  totalSupply: bigint;
  vaultUmaBalance: bigint;
  reservedForClaims: bigint;
  protocolFeesAccrued: bigint;
  totalReadyToClaimOutstanding: bigint;
  unallocatedManagedAssets: bigint;
  protocolFeeBps: bigint;
  limits: {
    minDepositPerTx: bigint;
    maxDepositPerTx: bigint;
    minRedeemSharesPerTx: bigint;
    maxRedeemSharesPerTx: bigint;
  };
  depositShareAdjustBps: bigint;
  lastUnstakeRoundId: number;
  stakeRoutingMode: bigint;
  lastRoundIdTrackersUpdated: number;
  proxyAddresses: `0x${string}`[];
  activeProxyCount: number;
  proxies: ProxySnapshot[];
  currentRoundId: number;
  votePhase: number;
  roundEndTime: number;
  redeemQueue: RedeemQueueItem[];
  candidateQueue: RedeemQueueItem[];
  errors: Record<string, string>;
}
