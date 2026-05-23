import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { PublicClient } from "viem";
import { REFRESH_INTERVAL_MS, STALE_THRESHOLD_MS, type NetworkKey } from "../config/networks";
import { createOpsClient } from "../lib/contracts";
import { loadVaultSnapshot } from "../lib/vaultLoader";
import type { VaultSnapshot } from "../types";

export function useVaultData(
  networkKey: () => NetworkKey,
  vaultAddress: () => `0x${string}`,
  autoRefresh: () => boolean
) {
  const data = ref<VaultSnapshot | null>(null);
  const state = ref<"loading" | "loaded" | "failed">("loading");
  const error = ref<string | null>(null);
  let client: PublicClient = createOpsClient(networkKey());
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    state.value = "loading";
    error.value = null;
    try {
      const configured = import.meta.env.VITE_PROXY_ADDRESSES?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) as `0x${string}`[] | undefined;

      data.value = await loadVaultSnapshot(client, vaultAddress(), configured);
      state.value = "loaded";
    } catch (e) {
      error.value = (e as Error).message;
      state.value = "failed";
    }
  }

  const isStale = computed(() => {
    if (!data.value) return false;
    return Date.now() - data.value.updatedAt.getTime() > STALE_THRESHOLD_MS;
  });

  const sectionState = computed(() => {
    if (state.value === "loading") return "loading";
    if (isStale.value) return "stale";
    if (state.value === "failed") return "failed";
    return "loaded";
  });

  function setupTimer() {
    if (timer) clearInterval(timer);
    if (autoRefresh()) {
      timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    }
  }

  watch([networkKey, vaultAddress], () => {
    client = createOpsClient(networkKey());
    void refresh();
  });

  watch(autoRefresh, setupTimer);

  onMounted(() => {
    client = createOpsClient(networkKey());
    void refresh();
    setupTimer();
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { data, state, error, refresh, isStale, sectionState };
}
