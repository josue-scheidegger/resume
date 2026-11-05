<script setup>
import { computed } from 'vue'
import { usePageData } from 'vuepress/client'

const page = usePageData()

// git.updatedTime: timestamp UTC (ms) fourni par le plugin git du thème.
const date = computed(() => {
  const t = page.value.git?.updatedTime
  return t ? new Date(t).toISOString().slice(0, 10) : ''
})
</script>

<template>
  <div v-if="date" class="resume-last-updated">Last updated: {{ date }}</div>
</template>

<style scoped>
.resume-last-updated {
  margin-top: 2rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--vp-c-border, #e2e2e3);
  font-size: 0.85rem;
  color: var(--vp-c-text-mute, #888);
}
</style>
