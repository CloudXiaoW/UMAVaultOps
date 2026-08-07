import { parseAbiItem, type PublicClient } from "viem";
import type { ProxySnapshot } from "../types";
import { ABIS, readContract } from "./contracts";
import { VOTE_PHASE_DURATION_SEC } from "./votingTiming";

/** Matches UMA VotingV2.sol — identifier is indexed. */
const VOTE_COMMITTED = parseAbiItem(
  "event VoteCommitted(address indexed voter, address indexed caller, uint32 roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData)"
);
const VOTE_REVEALED = parseAbiItem(
  "event VoteRevealed(address indexed voter, address indexed caller, uint32 roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData, int256 price, uint128 numTokens)"
);

/** Infura / many public RPCs reject eth_getLogs over large ranges (~10k+). */
const LOG_CHUNK_BLOCKS = 2_000n;
/** Cover ~2 full UMA rounds (commit+reveal each 1d) plus buffer. */
const LOOKBACK_ROUNDS = 2;
const ETH_BLOCK_TIME_SEC = 12;

type PendingRequest = {
  lastVotingRound: number;
  isGovernance: boolean;
  time: bigint;
  rollCount: number;
  identifier: `0x${string}`;
  ancillaryData: `0x${string}`;
};

function requestKey(identifier: `0x${string}`, time: bigint, ancillaryData: `0x${string}`): string {
  return `${identifier.toLowerCase()}-${time.toString()}-${ancillaryData.toLowerCase()}`;
}

function collectRoundKeys(
  logs: {
    args: {
      roundId?: number;
      identifier?: `0x${string}`;
      time?: bigint;
      ancillaryData?: `0x${string}`;
    };
  }[],
  currentRoundId: number
): Set<string> {
  const keys = new Set<string>();
  for (const log of logs) {
    const { roundId, identifier, time, ancillaryData } = log.args;
    if (Number(roundId) !== currentRoundId || identifier == null || time == null || ancillaryData == null) {
      continue;
    }
    keys.add(requestKey(identifier, time, ancillaryData));
  }
  return keys;
}

async function getLogsChunked(
  client: PublicClient,
  params: {
    address: `0x${string}`;
    event: typeof VOTE_COMMITTED | typeof VOTE_REVEALED;
    args: { voter?: `0x${string}`; caller?: `0x${string}` };
    fromBlock: bigint;
    toBlock: bigint;
  }
) {
  const { fromBlock, toBlock, ...rest } = params;
  if (toBlock < fromBlock) return [];

  const all: Awaited<ReturnType<PublicClient["getLogs"]>> = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_BLOCKS + 1n) {
    const end = start + LOG_CHUNK_BLOCKS > toBlock ? toBlock : start + LOG_CHUNK_BLOCKS;
    const logs = await client.getLogs({ ...rest, fromBlock: start, toBlock: end });
    all.push(...logs);
  }
  return all;
}

async function fetchVoteLogs(
  client: PublicClient,
  voting: `0x${string}`,
  event: typeof VOTE_COMMITTED | typeof VOTE_REVEALED,
  voter: `0x${string}`,
  caller: `0x${string}` | null,
  fromBlock: bigint,
  toBlock: bigint
) {
  const byVoter = await getLogsChunked(client, {
    address: voting,
    event,
    args: { voter },
    fromBlock,
    toBlock,
  });

  if (!caller || caller.toLowerCase() === voter.toLowerCase()) return byVoter;

  const byCaller = await getLogsChunked(client, {
    address: voting,
    event,
    args: { caller },
    fromBlock,
    toBlock,
  });

  const seen = new Set(byVoter.map((l) => l.transactionHash + String(l.logIndex ?? 0)));
  const merged = [...byVoter];
  for (const log of byCaller) {
    const id = log.transactionHash + String(log.logIndex ?? 0);
    if (!seen.has(id)) merged.push(log);
  }
  return merged;
}

function lookbackFromBlock(blockNumber: bigint, roundEndTime: number): bigint {
  // Enough history for lastCommit/lastReveal across recent rounds (~2 full rounds).
  const minLookback = BigInt(
    Math.ceil((VOTE_PHASE_DURATION_SEC * 2 * LOOKBACK_ROUNDS) / ETH_BLOCK_TIME_SEC) + 2_000
  );

  let lookback = minLookback;
  if (roundEndTime > 0) {
    const lookbackStartSec = roundEndTime - VOTE_PHASE_DURATION_SEC * 2 * LOOKBACK_ROUNDS;
    const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - lookbackStartSec);
    const byTime = BigInt(Math.ceil(ageSec / ETH_BLOCK_TIME_SEC) + 500);
    if (byTime > lookback) lookback = byTime;
  }

  return blockNumber > lookback ? blockNumber - lookback : 0n;
}

export async function fetchProxyVoting(
  client: PublicClient,
  voting: `0x${string}`,
  proxy: `0x${string}`,
  currentRoundId: number,
  blockNumber: bigint,
  roundEndTime: number
): Promise<
  Pick<
    ProxySnapshot,
    "committedCurrentRound" | "revealedCurrentRound" | "lastCommitRoundId" | "lastRevealRoundId"
  >
> {
  let committedCurrentRound = false;
  let revealedCurrentRound = false;
  let lastCommitRoundId: number | null = null;
  let lastRevealRoundId: number | null = null;

  const fromBlock = lookbackFromBlock(blockNumber, roundEndTime);

  try {
    let delegate: `0x${string}` | null = null;
    try {
      const stakes = await readContract<
        readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, `0x${string}`]
      >(client, voting, ABIS.voting, "voterStakes", [proxy]);
      const d = stakes[7];
      if (d && d !== "0x0000000000000000000000000000000000000000") delegate = d;
    } catch {
      /* optional */
    }

    const [commitLogs, revealLogs, pendingRequests] = await Promise.all([
      fetchVoteLogs(client, voting, VOTE_COMMITTED, proxy, delegate, fromBlock, blockNumber),
      fetchVoteLogs(client, voting, VOTE_REVEALED, proxy, delegate, fromBlock, blockNumber),
      readContract<readonly PendingRequest[]>(client, voting, ABIS.voting, "getPendingRequests").catch(
        () => [] as readonly PendingRequest[]
      ),
    ]);

    for (const log of commitLogs) {
      const roundId = Number(log.args.roundId ?? 0);
      if (roundId > (lastCommitRoundId ?? 0)) lastCommitRoundId = roundId;
    }
    for (const log of revealLogs) {
      const roundId = Number(log.args.roundId ?? 0);
      if (roundId > (lastRevealRoundId ?? 0)) lastRevealRoundId = roundId;
    }

    const commitKeys = collectRoundKeys(commitLogs, currentRoundId);
    const revealKeys = collectRoundKeys(revealLogs, currentRoundId);

    if (pendingRequests.length === 0) {
      committedCurrentRound = commitKeys.size > 0;
      revealedCurrentRound = revealKeys.size > 0;
    } else {
      committedCurrentRound = pendingRequests.every((r) =>
        commitKeys.has(requestKey(r.identifier, r.time, r.ancillaryData))
      );
      revealedCurrentRound = pendingRequests.every((r) =>
        revealKeys.has(requestKey(r.identifier, r.time, r.ancillaryData))
      );
    }
  } catch {
    /* RPC log limits or decode errors */
  }

  return {
    committedCurrentRound,
    revealedCurrentRound,
    lastCommitRoundId,
    lastRevealRoundId,
  };
}
