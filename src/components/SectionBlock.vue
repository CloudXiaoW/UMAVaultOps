<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ id: string; title: string; state?: string }>();
const { t } = useI18n();
</script>

<template>
  <section :id="id" class="section">
    <div class="section-head">
      <h2>{{ title }}</h2>
      <span v-if="state" class="badge" :class="`badge-${state}`">{{ t(`common.${state}`) }}</span>
    </div>
    <slot />
  </section>
</template>
