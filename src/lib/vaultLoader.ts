import { decodeEventLog, parseAbiItem, type Log, type PublicClient } from "viem";
import { PROXY_STATUS } from "../config/networks";
import type { ProxySnapshot, RedeemQueueItem, VaultSnapshot } from "../types";
import { ABIS, readContract } from "./contracts";
import { readPendingCandidateSenders, readVaultDynamicFields } from "./storage";

async function discoverProxies(
  client: PublicClient,
  vault: `0x${string}`,
  configured?: `0x${string}`[]
): Promise<`0x${string}`[]> {
  if (configured?.length) return configured;
  const len = await readContract<number>(client, vault, ABIS.vault, "getProxyLength");
  const addrs: `0x${string}`[] = [];
  for (let i = 0; i < Number(len); i++) {
    const p = await readContract<`0x${string}`>(client, vault, ABIS.vault, "proxies", [BigInt(i)]);
    if (p && p !== "0x0000000000000000000000000000000000000000") addrs.push(p);
  }
  return addrs;
}

async function fetchProxyVoting(
  client: PublicClient,
  voting: `0x${string}`,
  proxy: `0x${string}`,
  currentRoundId: number,
  fromBlock: bigint
): Promise<Pick<ProxySnapshot, "committedCurrentRound" | "revealedCurrentRound" | "lastCommitRoundId" | "lastRevealRoundId">> {
  let committedCurrentRound = false;
  let revealedCurrentRound = false;
  let lastCommitRoundId: number | null = null;
  let lastRevealRoundId: number | null = null;

  try {
    const [commitLogs, revealLogs] = await Promise.all([
      client.getLogs({
        address: voting,
        event: parseAbiItem(
          "event VoteCommitted(address indexed voter, address indexed caller, uint32 roundId, bytes32 identifier, uint256 time, bytes ancillaryData)"
        ),
        args: { voter: proxy },
        fromBlock,
        toBlock: "latest",
      }),
      client.getLogs({
        address: voting,
        event: parseAbiItem(
          "event VoteRevealed(address indexed voter, address indexed caller, uint32 roundId, bytes32 identifier, uint256 time, bytes ancillaryData, int256 price)"
        ),
        args: { voter: proxy },
        fromBlock,
        toBlock: "latest",
      }),
    ]);

    for (const log of commitLogs as Log[]) {
      const decoded = decodeEventLog({ abi: ABIS.voting, data: log.data, topics: log.topics });
      if (decoded.eventName !== "VoteCommitted") continue;
      const roundId = Number((decoded.args as unknown as { roundId: number }).roundId);
      if (roundId > (lastCommitRoundId ?? 0)) lastCommitRoundId = roundId;
      if (roundId === currentRoundId) committedCurrentRound = true;
    }
    for (const log of revealLogs as Log[]) {
      const decoded = decodeEventLog({ abi: ABIS.voting, data: log.data, topics: log.topics });
      if (decoded.eventName !== "VoteRevealed") continue;
      const roundId = Number((decoded.args as unknown as { roundId: number }).roundId);
      if (roundId > (lastRevealRoundId ?? 0)) lastRevealRoundId = roundId;
      if (roundId === currentRoundId) revealedCurrentRound = true;
    }
  } catch {
    /* RPC log limits */
  }

  return { committedCurrentRound, revealedCurrentRound, lastCommitRoundId, lastRevealRoundId };
}

async function fetchRedeemQueue(
  client: PublicClient,
  vault: `0x${string}`,
  senders: `0x${string}`[],
  queue: "active" | "candidate"
): Promise<RedeemQueueItem[]> {
  const items: RedeemQueueItem[] = [];
  const fn = queue === "active" ? "getRedeemRequest" : "getCandidateRedeemRequest";

  await Promise.all(
    senders.map(async (sender) => {
      const [receiver, sharesBurned, assetsToClaim, proxyAddress, claimableTime, isReadyToClaim] =
        await readContract<readonly [`0x${string}`, bigint, bigint, `0x${string}`, bigint, boolean]>(
          client, vault, ABIS.vault, fn, [sender]
        );
      if (sharesBurned === 0n && assetsToClaim === 0n) return;

      let claimable = isReadyToClaim;
      if (!claimable) {
        try {
          const [canClaim] = await readContract<readonly [boolean]>(
            client, vault, ABIS.vault, "canClaimRedeem", [sender]
          );
          claimable = canClaim;
        } catch {
          claimable = false;
        }
      }

      items.push({
        sender,
        receiver,
        shares: sharesBurned,
        assets: assetsToClaim,
        readyTimestamp: Number(claimableTime),
        proxyAddress,
        claimable,
        queue,
      });
    })
  );

  items.sort((a, b) => {
    if (a.claimable !== b.claimable) return a.claimable ? -1 : 1;
    return a.readyTimestamp - b.readyTimestamp;
  });
  return items;
}

export async function loadVaultSnapshot(
  client: PublicClient,
  vaultAddress: `0x${string}`,
  configuredProxies?: `0x${string}`[]
): Promise<VaultSnapshot> {
  const errors: Record<string, string> = {};
  const block = await client.getBlock({ blockTag: "latest" });
  const blockNumber = block.number;
  const fromBlock = blockNumber > 50_000n ? blockNumber - 50_000n : 0n;
  const vault = vaultAddress;

  const baseReads = await Promise.allSettled([
    readContract<`0x${string}`>(client, vault, ABIS.vault, "shareToken"),
    readContract<`0x${string}`>(client, vault, ABIS.vault, "uma"),
    readContract<`0x${string}`>(client, vault, ABIS.vault, "votingV2"),
    readContract<`0x${string}`>(client, vault, ABIS.vault, "owner"),
    readContract<`0x${string}`>(client, vault, ABIS.vault, "feeRecipient"),
    readContract<`0x${string}`>(client, vault, ABIS.vault, "upgradeTimelock"),
    readContract<boolean>(client, vault, ABIS.vault, "isSystemGovernanceConsistent"),
    readContract<boolean>(client, vault, ABIS.vault, "isShareGovernanceConsistent"),
    readContract<boolean>(client, vault, ABIS.vault, "depositPaused"),
    readContract<boolean>(client, vault, ABIS.vault, "redeemPaused"),
    readContract<boolean>(client, vault, ABIS.vault, "claimPaused"),
    readContract<bigint>(client, vault, ABIS.vault, "reservedForClaims"),
    readContract<bigint>(client, vault, ABIS.vault, "protocolFeesAccrued"),
    readContract<bigint>(client, vault, ABIS.vault, "totalReadyToClaimOutstanding"),
    readContract<bigint>(client, vault, ABIS.vault, "unallocatedManagedAssets"),
    readContract<bigint>(client, vault, ABIS.vault, "protocolFeeBps"),
    readContract<readonly [bigint, bigint, bigint, bigint]>(client, vault, ABIS.vault, "getLimits"),
    readContract<number>(client, vault, ABIS.vault, "lastUnstakeRoundId"),
    readContract<bigint>(client, vault, ABIS.vault, "pendingRedeemRequestCount"),
    readContract<bigint>(client, vault, ABIS.vault, "pendingCandidateRedeemRequestCount"),
  ]);

  const pick = <T,>(i: number, fallback: T): T => {
    const r = baseReads[i];
    if (r.status === "fulfilled") return r.value as T;
    errors[`read_${i}`] = (r.reason as Error)?.message ?? "read failed";
    return fallback;
  };

  const shareToken = pick(0, "0x0" as `0x${string}`);
  const uma = pick(1, "0x0" as `0x${string}`);
  const votingV2 = pick(2, "0x0" as `0x${string}`);
  const owner = pick(3, "0x0" as `0x${string}`);
  const feeRecipient = pick(4, "0x0" as `0x${string}`);
  const upgradeTimelock = pick(5, "0x0" as `0x${string}`);
  const limitsTuple = pick(16, [0n, 0n, 0n, 0n] as const);

  let totalAssets = 0n;
  try {
    totalAssets = await readContract<bigint>(client, vault, ABIS.vault, "totalAssets");
  } catch (e) {
    errors.totalAssets = (e as Error).message;
  }

  let totalSupply = 0n;
  try {
    totalSupply = await readContract<bigint>(client, shareToken, ABIS.share, "totalSupply");
  } catch (e) {
    errors.totalSupply = (e as Error).message;
  }

  let vaultUmaBalance = 0n;
  try {
    vaultUmaBalance = await readContract<bigint>(client, uma, ABIS.erc20, "balanceOf", [vault]);
  } catch (e) {
    errors.vaultBalance = (e as Error).message;
  }

  let storageFields = {
    depositShareAdjustBps: 0n,
    lastUnstakeRoundId: pick(17, 0),
    stakeRoutingMode: 999n,
    lastRoundIdTrackersUpdated: 0,
  };
  try {
    storageFields = await readVaultDynamicFields(client, vault);
  } catch (e) {
    errors.storage = (e as Error).message;
  }

  let currentRoundId = 0;
  let votePhase = 0;
  let roundEndTime = 0;
  try {
    currentRoundId = Number(await readContract<number>(client, votingV2, ABIS.voting, "getCurrentRoundId"));
    votePhase = Number(await readContract<number>(client, votingV2, ABIS.voting, "getVotePhase"));
    roundEndTime = Number(
      await readContract<bigint>(client, votingV2, ABIS.voting, "getRoundEndTime", [BigInt(currentRoundId)])
    );
  } catch (e) {
    errors.voting = (e as Error).message;
  }

  const proxyAddresses = await discoverProxies(client, vault, configuredProxies);

  const proxies: ProxySnapshot[] = await Promise.all(
    proxyAddresses.map(async (proxy) => {
      const statusCode = Number(
        await readContract<number>(client, vault, ABIS.vault, "proxyStatus", [proxy])
      );
      const status = PROXY_STATUS[statusCode] ?? "Unknown";

      const [
        governanceConsistent,
        proxyInfo,
        umaBal,
        stakePaused,
        withdrawPaused,
        requestUnstakePaused,
        executeUnstakePaused,
        unstakeReady,
        votingFlags,
      ] = await Promise.all([
        readContract<boolean>(client, vault, ABIS.vault, "isProxyGovernanceConsistent", [proxy]),
        readContract<readonly [boolean, bigint, bigint, bigint]>(client, vault, ABIS.vault, "getProxyInfo", [proxy]),
        readContract<bigint>(client, uma, ABIS.erc20, "balanceOf", [proxy]),
        readContract<boolean>(client, proxy, ABIS.stakeProxy, "stakePaused"),
        readContract<boolean>(client, proxy, ABIS.stakeProxy, "withdrawPaused"),
        readContract<boolean>(client, proxy, ABIS.stakeProxy, "requestUnstakePaused"),
        readContract<boolean>(client, proxy, ABIS.stakeProxy, "executeUnstakePaused"),
        readContract<bigint>(client, proxy, ABIS.stakeProxy, "unstakeReadyTime"),
        fetchProxyVoting(client, votingV2, proxy, currentRoundId, fromBlock),
      ]);

      const [, staked, pending, rewards] = proxyInfo;

      return {
        address: proxy,
        status,
        statusCode,
        governanceConsistent,
        staked,
        pendingUnstake: pending,
        outstandingWithdraw: umaBal,
        outstandingRewards: rewards,
        unstakeReadyTime: Number(unstakeReady),
        stakePaused,
        withdrawPaused,
        requestUnstakePaused,
        executeUnstakePaused,
        ...votingFlags,
      };
    })
  );

  const activeProxyCount = proxies.filter((p) => p.status === "Active" || p.status === "Draining").length;
  const pendingCount = Number(pick(18, 0n));

  const pendingSenders: `0x${string}`[] = [];
  for (let i = 0; i < pendingCount; i++) {
    try {
      pendingSenders.push(
        await readContract<`0x${string}`>(client, vault, ABIS.vault, "getPendingRedeemSender", [BigInt(i)])
      );
    } catch {
      break;
    }
  }

  let candidateSenders: `0x${string}`[] = [];
  try {
    candidateSenders = await readPendingCandidateSenders(client, vault);
  } catch (e) {
    errors.candidateQueue = (e as Error).message;
  }

  const [redeemQueue, candidateQueue] = await Promise.all([
    fetchRedeemQueue(client, vault, pendingSenders, "active"),
    fetchRedeemQueue(client, vault, candidateSenders, "candidate"),
  ]);

  let firstProxyManager: `0x${string}` | null = null;
  if (proxyAddresses.length > 0) {
    try {
      firstProxyManager = await readContract<`0x${string}`>(
        client,
        proxyAddresses[0],
        ABIS.stakeProxy,
        "manager"
      );
    } catch (e) {
      errors.firstProxyManager = (e as Error).message;
    }
  }

  return {
    blockNumber,
    updatedAt: new Date(),
    vault,
    shareToken,
    uma,
    votingV2,
    owner,
    feeRecipient,
    upgradeTimelock,
    firstProxyManager,
    systemGovernanceOk: pick(6, false),
    shareGovernanceOk: pick(7, false),
    depositPaused: pick(8, false),
    redeemPaused: pick(9, false),
    claimPaused: pick(10, false),
    totalAssets,
    totalSupply,
    vaultUmaBalance,
    reservedForClaims: pick(11, 0n),
    protocolFeesAccrued: pick(12, 0n),
    totalReadyToClaimOutstanding: pick(13, 0n),
    unallocatedManagedAssets: pick(14, 0n),
    protocolFeeBps: pick(15, 0n),
    limits: {
      minDepositPerTx: limitsTuple[0],
      maxDepositPerTx: limitsTuple[1],
      minRedeemSharesPerTx: limitsTuple[2],
      maxRedeemSharesPerTx: limitsTuple[3],
    },
    depositShareAdjustBps: storageFields.depositShareAdjustBps,
    lastUnstakeRoundId: storageFields.lastUnstakeRoundId,
    stakeRoutingMode: storageFields.stakeRoutingMode,
    lastRoundIdTrackersUpdated: storageFields.lastRoundIdTrackersUpdated,
    proxyAddresses,
    activeProxyCount,
    proxies,
    currentRoundId,
    votePhase,
    roundEndTime,
    redeemQueue,
    candidateQueue,
    errors,
  };
}
