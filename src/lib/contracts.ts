import { createPublicClient, http, type Abi, type PublicClient } from "viem";
import vaultAbi from "../abis/vault.json";
import shareAbi from "../abis/share.json";
import stakeProxyAbi from "../abis/stakeProxy.json";
import erc20Abi from "../abis/erc20.json";
import votingAbi from "../abis/voting.json";
import { NETWORKS, type NetworkKey } from "../config/networks";

export const ABIS = {
  vault: vaultAbi as Abi,
  share: shareAbi as Abi,
  stakeProxy: stakeProxyAbi as Abi,
  erc20: erc20Abi as Abi,
  voting: votingAbi as Abi,
};

export function resolveNetworkKey(): NetworkKey {
  const key = (import.meta.env.VITE_CHAIN ?? "mainnet").toLowerCase();
  return key === "sepolia" ? "sepolia" : "mainnet";
}

export function createOpsClient(networkKey: NetworkKey, rpcUrl?: string): PublicClient {
  const net = NETWORKS[networkKey];
  return createPublicClient({
    chain: net.chain,
    transport: http(rpcUrl || import.meta.env.VITE_RPC_URL || net.defaultRpc),
  });
}

export function getDefaultVaultAddress(networkKey: NetworkKey): `0x${string}` {
  const fromEnv = import.meta.env.VITE_VAULT_ADDRESS;
  if (fromEnv) return fromEnv as `0x${string}`;
  return NETWORKS[networkKey].defaultVault;
}

export function explorerAddressUrl(explorer: string, address: string): string {
  return `${explorer}/address/${address}`;
}

export async function readContract<T>(
  client: PublicClient,
  address: `0x${string}`,
  abi: Abi,
  functionName: string,
  args?: readonly unknown[]
): Promise<T> {
  return (await client.readContract({
    address,
    abi,
    functionName,
    args,
  })) as T;
}
