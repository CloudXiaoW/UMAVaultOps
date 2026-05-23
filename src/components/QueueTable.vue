<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { RedeemQueueItem } from "../types";
import { formatShares, formatTimestamp, formatUma } from "../lib/format";
import AddressCell from "./AddressCell.vue";
import DataTable from "./DataTable.vue";

defineProps<{ items: RedeemQueueItem[]; explorer: string }>();
const { t } = useI18n();

const zero = "0x0000000000000000000000000000000000000000";
</script>

<template>
  <DataTable
    :columns="[
      { key: 'sender', label: t('queue.sender') },
      { key: 'receiver', label: t('queue.receiver') },
      { key: 'shares', label: t('queue.shares'), mono: true },
      { key: 'assets', label: t('queue.assets'), mono: true },
      { key: 'ready', label: t('queue.readyTime'), mono: true },
      { key: 'proxy', label: t('queue.proxy') },
      { key: 'claimable', label: t('queue.claimable') },
    ]"
    :empty="t('queue.empty')"
    :has-rows="items.length > 0"
  >
    <tr v-for="r in items" :key="r.sender" :class="{ 'row-highlight': r.claimable }">
      <td><AddressCell :address="r.sender" :explorer="explorer" /></td>
      <td><AddressCell :address="r.receiver" :explorer="explorer" /></td>
      <td class="mono">{{ formatShares(r.shares) }}</td>
      <td class="mono">{{ formatUma(r.assets) }}</td>
      <td class="mono">{{ r.readyTimestamp ? formatTimestamp(r.readyTimestamp) : t('status.pendingAssignment') }}</td>
      <td>
        <AddressCell v-if="r.proxyAddress !== zero" :address="r.proxyAddress" :explorer="explorer" />
        <span v-else>{{ t('status.notAssigned') }}</span>
      </td>
      <td>{{ r.claimable ? t('status.yes') : t('status.no') }}</td>
    </tr>
  </DataTable>
</template>
