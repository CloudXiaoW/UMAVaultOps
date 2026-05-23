import { formatUnits } from "viem";

export function shortenAddress(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head + 2)}…${addr.slice(-tail)}`;
}

export function formatUma(value: bigint, decimals = 18, places = 3): string {
  const n = Number(formatUnits(value, decimals));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

export function formatShares(value: bigint, decimals = 18, places = 3): string {
  return formatUma(value, decimals, places);
}

export function formatNav(totalAssets: bigint, totalSupply: bigint): string {
  if (totalSupply === 0n) return "—";
  const nav = (Number(totalAssets) / Number(totalSupply)) * 1e18;
  return (nav / 1e18).toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

export function formatBps(bps: bigint | number): string {
  const n = Number(bps);
  return `${n} bps (${(n / 100).toFixed(2)}%)`;
}

export function formatTimestamp(ts: number | bigint | null): string {
  if (ts == null || Number(ts) === 0) return "—";
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatBlock(n: bigint | number): string {
  return Number(n).toLocaleString();
}

export function formatDateTime(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
