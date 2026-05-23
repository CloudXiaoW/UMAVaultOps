<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { shortenAddress } from "../lib/format";

const props = defineProps<{ address: string; explorer: string }>();
const { t } = useI18n();
const copied = ref(false);

async function copy() {
  await navigator.clipboard.writeText(props.address);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <span class="addr-cell">
    <code :title="address">{{ shortenAddress(address) }}</code>
    <button type="button" class="link-btn" @click="copy">{{ copied ? t("common.copied") : t("common.copy") }}</button>
    <a class="link-btn" :href="`${explorer}/address/${address}`" target="_blank" rel="noreferrer">↗</a>
  </span>
</template>
