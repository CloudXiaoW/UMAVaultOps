import type { Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";

export type NetworkKey = "mainnet" | "sepolia";

export interface NetworkConfig {
  key: NetworkKey;
  chain: Chain;
  label: string;
  explorer: string;
  defaultVault: `0x${string}`;
  defaultRpc: string;
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  mainnet: {
    key: "mainnet",
    chain: mainnet,
    label: "Ethereum Mainnet",
    explorer: "https://etherscan.io",
    defaultVault: "0xC2F890d698D2b7ed27168636Ef27700b6250f708",
    defaultRpc: "https://eth.llamarpc.com",
  },
  sepolia: {
    key: "sepolia",
    chain: sepolia,
    label: "Sepolia Testnet",
    explorer: "https://sepolia.etherscan.io",
    defaultVault: "0x0880B22De9376CDd8adcA0549d1A0f4823FD11EB",
    defaultRpc: "https://rpc.sepolia.org",
  },
};

export const VAULT_STORAGE_SLOT =
  "0x4ab7b6fe5069a9756ff0cd84d78eaa46c7c0b93f3523e7f2dd350ce220a490c0" as const;

export const VAULT_STORAGE_OFFSETS = {
  depositShareAdjustBps: 9n,
  lastUnstakeRoundId: 10n,
  stakeRoutingMode: 11n,
  lastRoundIdTrackersUpdated: 12n,
} as const;

export const BALANCED_ROUTING_MODE = 999n;
export const PROXY_STATUS = ["None", "Active", "Draining", "Disabled"] as const;
export const REFRESH_INTERVAL_MS = 60_000;
export const STALE_THRESHOLD_MS = 5 * 60_000;
