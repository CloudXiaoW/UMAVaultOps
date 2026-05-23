import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { PublicClient } from "viem";
import { REFRESH_INTERVAL_MS, STALE_THRESHOLD_MS, type NetworkKey } from "../config/networks";
import { createOpsClient } from "../lib/contracts";
import { getTimelockAddress, loadTimelockEvents, type TimelockEventRow } from "../lib/timelock";

export function useTimelockEvents(networkKey: () => NetworkKey, autoRefresh: () => boolean) {
  const timelockAddress = computed(() => getTimelockAddress());
  const events = ref<TimelockEventRow[]>([]);
  const fromBlock = ref<bigint | null>(null);
  const state = ref<"idle" | "loading" | "loaded" | "failed">("idle");
  const error = ref<string | null>(null);
  const updatedAt = ref<Date | null>(null);
  let client: PublicClient = createOpsClient(networkKey());
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    if (!timelockAddress.value) {
      state.value = "idle";
      events.value = [];
      return;
    }
    state.value = "loading";
    error.value = null;
    try {
      const result = await loadTimelockEvents(client, timelockAddress.value);
      events.value = result.events;
      fromBlock.value = result.fromBlock;
      if (result.error) error.value = result.error;
      updatedAt.value = new Date();
      state.value = "loaded";
    } catch (e) {
      error.value = (e as Error).message;
      state.value = "failed";
    }
  }

  const isStale = computed(() => {
    if (!updatedAt.value) return false;
    return Date.now() - updatedAt.value.getTime() > STALE_THRESHOLD_MS;
  });

  const sectionState = computed(() => {
    if (!timelockAddress.value) return "loaded";
    if (state.value === "loading") return "loading";
    if (isStale.value) return "stale";
    if (state.value === "failed") return "failed";
    return "loaded";
  });

  function setupTimer() {
    if (timer) clearInterval(timer);
    if (autoRefresh() && timelockAddress.value) {
      timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    }
  }

  watch(networkKey, () => {
    client = createOpsClient(networkKey());
    void refresh();
  });

  watch([autoRefresh, timelockAddress], setupTimer);

  onMounted(() => {
    client = createOpsClient(networkKey());
    void refresh();
    setupTimer();
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return {
    timelockAddress,
    events,
    fromBlock,
    state,
    error,
    updatedAt,
    refresh,
    isStale,
    sectionState,
  };
}
