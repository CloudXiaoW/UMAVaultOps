import { keccak256, pad, toHex, type PublicClient } from "viem";
import { VAULT_STORAGE_OFFSETS, VAULT_STORAGE_SLOT } from "../config/networks";

const PENDING_CANDIDATE_ARRAY_SLOT_OFFSET = 28n;
const STORAGE_BASE = BigInt(VAULT_STORAGE_SLOT);

function slotAt(offset: bigint): `0x${string}` {
  return `0x${(STORAGE_BASE + offset).toString(16).padStart(64, "0")}` as `0x${string}`;
}

export async function readVaultStorageField(
  client: PublicClient,
  vaultAddress: `0x${string}`,
  offset: bigint
): Promise<bigint> {
  const raw = await client.getStorageAt({ address: vaultAddress, slot: slotAt(offset) });
  return raw ? BigInt(raw) : 0n;
}

export async function readVaultDynamicFields(client: PublicClient, vaultAddress: `0x${string}`) {
  const [depositShareAdjustBps, lastUnstakeRoundId, stakeRoutingMode, lastRoundIdTrackersUpdated] =
    await Promise.all([
      readVaultStorageField(client, vaultAddress, VAULT_STORAGE_OFFSETS.depositShareAdjustBps),
      readVaultStorageField(client, vaultAddress, VAULT_STORAGE_OFFSETS.lastUnstakeRoundId),
      readVaultStorageField(client, vaultAddress, VAULT_STORAGE_OFFSETS.stakeRoutingMode),
      readVaultStorageField(client, vaultAddress, VAULT_STORAGE_OFFSETS.lastRoundIdTrackersUpdated),
    ]);
  return {
    depositShareAdjustBps,
    lastUnstakeRoundId: Number(lastUnstakeRoundId),
    stakeRoutingMode,
    lastRoundIdTrackersUpdated: Number(lastRoundIdTrackersUpdated),
  };
}

export async function readPendingCandidateSenders(
  client: PublicClient,
  vaultAddress: `0x${string}`
): Promise<`0x${string}`[]> {
  const arraySlot = slotAt(PENDING_CANDIDATE_ARRAY_SLOT_OFFSET);
  const lengthRaw = await client.getStorageAt({ address: vaultAddress, slot: arraySlot });
  const length = lengthRaw ? Number(BigInt(lengthRaw)) : 0;
  if (length === 0) return [];

  const arraySlotNum = STORAGE_BASE + PENDING_CANDIDATE_ARRAY_SLOT_OFFSET;
  const dataBase = BigInt(keccak256(pad(toHex(arraySlotNum, { size: 32 }), { size: 32 })));

  const senders: `0x${string}`[] = [];
  for (let i = 0; i < length; i++) {
    const elemSlot = `0x${(dataBase + BigInt(i)).toString(16).padStart(64, "0")}` as `0x${string}`;
    const raw = await client.getStorageAt({ address: vaultAddress, slot: elemSlot });
    if (!raw) continue;
    const addr = `0x${BigInt(raw).toString(16).padStart(40, "0").slice(-40)}` as `0x${string}`;
    if (addr !== "0x0000000000000000000000000000000000000000") senders.push(addr);
  }
  return senders;
}
