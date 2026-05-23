<script setup lang="ts">
withDefaults(
  defineProps<{
    columns: { key: string; label: string; mono?: boolean }[];
    empty: string;
    hasRows?: boolean;
  }>(),
  { hasRows: true }
);
</script>

<template>
  <slot v-if="!hasRows" name="empty">
    <p class="empty">{{ empty }}</p>
  </slot>
  <div v-else class="table-wrap">
    <table>
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.key">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <slot />
      </tbody>
    </table>
  </div>
</template>
