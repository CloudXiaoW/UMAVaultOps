import type { PublicClient } from "viem";
import { decodeFunctionData, formatEther, keccak256, parseAbiItem, toHex } from "viem";

export const PROPOSER_ROLE = keccak256(toHex("PROPOSER_ROLE"));
export const EXECUTOR_ROLE = keccak256(toHex("EXECUTOR_ROLE"));
export const CANCELLER_ROLE = keccak256(toHex("CANCELLER_ROLE"));
export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const LOG_BLOCK_RANGE = 400_000n;

export type TimelockEventType =
  | "CallScheduled"
  | "CallExecuted"
  | "Cancelled"
  | "CallSalt"
  | "MinDelayChange"
  | "RoleGranted"
  | "RoleRevoked";

export interface TimelockEventRow {
  eventType: TimelockEventType;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  timestamp: number | null;
  operationId?: `0x${string}`;
  index?: number;
  target?: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  delay?: bigint;
  predecessor?: `0x${string}`;
  salt?: `0x${string}`;
  role?: `0x${string}`;
  roleLabel?: string;
  account?: `0x${string}`;
  sender?: `0x${string}`;
  oldDuration?: bigint;
  newDuration?: bigint;
  summary: string;
}

export function getTimelockAddress(): `0x${string}` | null {
  const raw = import.meta.env.VITE_TIMELOCK_ADDRESS?.trim();
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) return null;
  return raw as `0x${string}`;
}

function roleLabel(role: `0x${string}`): string {
  const r = role.toLowerCase();
  if (r === PROPOSER_ROLE.toLowerCase()) return "PROPOSER_ROLE";
  if (r === EXECUTOR_ROLE.toLowerCase()) return "EXECUTOR_ROLE";
  if (r === CANCELLER_ROLE.toLowerCase()) return "CANCELLER_ROLE";
  if (r === DEFAULT_ADMIN_ROLE) return "DEFAULT_ADMIN_ROLE";
  return role.slice(0, 10) + "…";
}

function summarizeCalldata(data: `0x${string}` | undefined): string {
  if (!data || data === "0x") return "—";
  const selector = data.slice(0, 10);
  try {
    const decoded = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "setFeeRecipient",
          inputs: [{ name: "feeRecipient_", type: "address" }],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "setOwner",
          inputs: [{ name: "newOwner_", type: "address" }],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "upgradeToAndCall",
          inputs: [
            { name: "newImplementation", type: "address" },
            { name: "data", type: "bytes" },
          ],
          stateMutability: "payable",
        },
      ],
      data,
    });
    const args = decoded.args as unknown as Record<string, string>;
    if (decoded.functionName === "setFeeRecipient" && args.feeRecipient_) {
      return `setFeeRecipient(${args.feeRecipient_})`;
    }
    if (decoded.functionName === "setOwner" && args.newOwner_) {
      return `setOwner(${args.newOwner_})`;
    }
    if (decoded.functionName === "upgradeToAndCall" && args.newImplementation) {
      return `upgradeToAndCall(${args.newImplementation})`;
    }
    return decoded.functionName;
  } catch {
    return `${selector} (${data.length > 12 ? data.slice(0, 18) + "…" : data})`;
  }
}

const TIMELOCK_EVENTS = [
  parseAbiItem(
    "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)"
  ),
  parseAbiItem(
    "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)"
  ),
  parseAbiItem("event Cancelled(bytes32 indexed id)"),
  parseAbiItem("event CallSalt(bytes32 indexed id, bytes32 salt)"),
  parseAbiItem("event MinDelayChange(uint256 oldDuration, uint256 newDuration)"),
  parseAbiItem("event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)"),
  parseAbiItem("event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)"),
] as const;

function rowFromLog(
  eventType: TimelockEventType,
  log: {
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    logIndex: number;
    args: Record<string, unknown>;
  }
): TimelockEventRow {
  const base = {
    eventType,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    timestamp: null as number | null,
  };

  switch (eventType) {
    case "CallScheduled": {
      const target = log.args.target as `0x${string}`;
      const data = log.args.data as `0x${string}`;
      const delay = log.args.delay as bigint;
      return {
        ...base,
        operationId: log.args.id as `0x${string}`,
        index: Number(log.args.index),
        target,
        value: log.args.value as bigint,
        data,
        delay,
        predecessor: log.args.predecessor as `0x${string}`,
        summary: `${summarizeCalldata(data)} · delay ${delay}s · ${formatEther((log.args.value as bigint) ?? 0n)} ETH`,
      };
    }
    case "CallExecuted": {
      const data = log.args.data as `0x${string}`;
      return {
        ...base,
        operationId: log.args.id as `0x${string}`,
        index: Number(log.args.index),
        target: log.args.target as `0x${string}`,
        value: log.args.value as bigint,
        data,
        summary: summarizeCalldata(data),
      };
    }
    case "Cancelled":
      return {
        ...base,
        operationId: log.args.id as `0x${string}`,
        summary: `operation ${String(log.args.id).slice(0, 14)}… cancelled`,
      };
    case "CallSalt":
      return {
        ...base,
        operationId: log.args.id as `0x${string}`,
        salt: log.args.salt as `0x${string}`,
        summary: `salt ${String(log.args.salt).slice(0, 14)}…`,
      };
    case "MinDelayChange":
      return {
        ...base,
        oldDuration: log.args.oldDuration as bigint,
        newDuration: log.args.newDuration as bigint,
        summary: `${log.args.oldDuration}s → ${log.args.newDuration}s`,
      };
    case "RoleGranted":
    case "RoleRevoked": {
      const role = log.args.role as `0x${string}`;
      const account = log.args.account as `0x${string}`;
      return {
        ...base,
        role,
        roleLabel: roleLabel(role),
        account,
        sender: log.args.sender as `0x${string}`,
        summary: `${roleLabel(role)} → ${account}`,
      };
    }
  }
}

export async function loadTimelockEvents(
  client: PublicClient,
  timelock: `0x${string}`,
  maxRows = 200
): Promise<{ events: TimelockEventRow[]; fromBlock: bigint; error?: string }> {
  const head = await client.getBlockNumber();
  const fromBlock = head > LOG_BLOCK_RANGE ? head - LOG_BLOCK_RANGE : 0n;

  try {
    const allLogs = await Promise.all(
      TIMELOCK_EVENTS.map((event) =>
        client.getLogs({
          address: timelock,
          event,
          fromBlock,
          toBlock: "latest",
        })
      )
    );

    const rows: TimelockEventRow[] = [];
    const eventNames: TimelockEventType[] = [
      "CallScheduled",
      "CallExecuted",
      "Cancelled",
      "CallSalt",
      "MinDelayChange",
      "RoleGranted",
      "RoleRevoked",
    ];

    for (let i = 0; i < allLogs.length; i++) {
      for (const log of allLogs[i]) {
        rows.push(
          rowFromLog(eventNames[i], {
            blockNumber: log.blockNumber ?? 0n,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex ?? 0,
            args: log.args as Record<string, unknown>,
          })
        );
      }
    }

    rows.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return Number(b.blockNumber - a.blockNumber);
      return b.logIndex - a.logIndex;
    });

    const blockNums = [...new Set(rows.slice(0, maxRows).map((r) => r.blockNumber))];
    const tsMap = new Map<string, number>();
    await Promise.all(
      blockNums.map(async (bn) => {
        const b = await client.getBlock({ blockNumber: bn });
        tsMap.set(bn.toString(), Number(b.timestamp));
      })
    );

    for (const row of rows) {
      row.timestamp = tsMap.get(row.blockNumber.toString()) ?? null;
    }

    return { events: rows.slice(0, maxRows), fromBlock };
  } catch (e) {
    return { events: [], fromBlock, error: (e as Error).message };
  }
}
