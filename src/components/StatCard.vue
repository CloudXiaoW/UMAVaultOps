<script setup lang="ts">
defineProps<{ label: string; value: string; tone?: "neutral" | "ok" | "warn" | "bad" }>();
</script>

<template>
  <div class="stat-card" :class="tone ? `tone-${tone}` : ''">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value">{{ value }}</div>
  </div>
</template>
