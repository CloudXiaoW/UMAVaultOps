import { parseAbiItem, type PublicClient } from "viem";
import type { ProxySnapshot } from "../types";
import { ABIS, readContract } from "./contracts";

/** Matches UMA VotingV2.sol — identifier is indexed. */
const VOTE_COMMITTED = parseAbiItem(
  "event VoteCommitted(address indexed voter, address indexed caller, uint32 roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData)"
);
const VOTE_REVEALED = parseAbiItem(
  "event VoteRevealed(address indexed voter, address indexed caller, uint32 roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData, int256 price, uint128 numTokens)"
);

type PendingRequest = {
  lastVotingRound: number;
  isGovernance: boolean;
  time: bigint;
  rollCount: number;
  identifier: `0x${string}`;
  ancillaryData: `0x${string}`;
};

function requestKey(identifier: `0x${string}`, time: bigint): string {
  return `${identifier.toLowerCase()}-${time.toString()}`;
}

function collectRoundKeys(
  logs: { args: { roundId?: number; identifier?: `0x${string}`; time?: bigint } }[],
  currentRoundId: number
): Set<string> {
  const keys = new Set<string>();
  for (const log of logs) {
    const { roundId, identifier, time } = log.args;
    if (roundId !== currentRoundId || identifier == null || time == null) continue;
    keys.add(requestKey(identifier, time));
  }
  return keys;
}

async function fetchVoteLogs(
  client: PublicClient,
  voting: `0x${string}`,
  event: typeof VOTE_COMMITTED | typeof VOTE_REVEALED,
  voter: `0x${string}`,
  caller: `0x${string}` | null,
  fromBlock: bigint
) {
  const byVoter = await client.getLogs({
    address: voting,
    event,
    args: { voter },
    fromBlock,
    toBlock: "latest",
  });

  if (!caller || caller.toLowerCase() === voter.toLowerCase()) return byVoter;

  const byCaller = await client.getLogs({
    address: voting,
    event,
    args: { caller },
    fromBlock,
    toBlock: "latest",
  });

  const seen = new Set(byVoter.map((l) => l.transactionHash + (l.logIndex ?? 0)));
  const merged = [...byVoter];
  for (const log of byCaller) {
    const id = log.transactionHash + (log.logIndex ?? 0);
    if (!seen.has(id)) merged.push(log);
  }
  return merged;
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

  const roundSpanBlocks = 50_000n;
  const fromBlock =
    blockNumber > roundSpanBlocks ? blockNumber - roundSpanBlocks : 0n;

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
      fetchVoteLogs(client, voting, VOTE_COMMITTED, proxy, delegate, fromBlock),
      fetchVoteLogs(client, voting, VOTE_REVEALED, proxy, delegate, fromBlock),
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
        commitKeys.has(requestKey(r.identifier, r.time))
      );
      revealedCurrentRound = pendingRequests.every((r) =>
        revealKeys.has(requestKey(r.identifier, r.time))
      );
    }

    void roundEndTime;
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
