<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { TimelockEventRow } from "../lib/timelock";
import { formatBlock, formatTimestamp } from "../lib/format";
import AddressCell from "./AddressCell.vue";

defineProps<{
  events: TimelockEventRow[];
  explorer: string;
  empty: string;
}>();

const { t } = useI18n();

function shortId(id: string | undefined): string {
  if (!id) return "—";
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}
</script>

<template>
  <p v-if="events.length === 0" class="empty">{{ empty }}</p>
  <div v-else class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>{{ t("timelock.colTime") }}</th>
          <th>{{ t("timelock.colBlock") }}</th>
          <th>{{ t("timelock.colEvent") }}</th>
          <th>{{ t("timelock.colOpId") }}</th>
          <th>{{ t("timelock.colTarget") }}</th>
          <th>{{ t("timelock.colSummary") }}</th>
          <th>{{ t("timelock.colTx") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(e, i) in events" :key="`${e.transactionHash}-${e.logIndex}-${i}`">
          <td class="mono">{{ e.timestamp ? formatTimestamp(e.timestamp) : "—" }}</td>
          <td class="mono">{{ formatBlock(e.blockNumber) }}</td>
          <td>
            <span class="event-tag" :class="`event-${e.eventType}`">{{ e.eventType }}</span>
          </td>
          <td class="mono" :title="e.operationId">{{ shortId(e.operationId) }}</td>
          <td>
            <AddressCell v-if="e.target" :address="e.target" :explorer="explorer" />
            <AddressCell v-else-if="e.account" :address="e.account" :explorer="explorer" />
            <span v-else>—</span>
          </td>
          <td class="summary-cell">{{ e.summary }}</td>
          <td>
            <a
              class="link-btn"
              :href="`${explorer}/tx/${e.transactionHash}`"
              target="_blank"
              rel="noreferrer"
            >
              ↗
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
