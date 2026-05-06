<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedMessage, ValidationIssue } from '@/parser'
import SegmentLine from './SegmentLine.vue'

const props = defineProps<{
  message: ParsedMessage
  index: number
}>()

const messageIssues = computed<ValidationIssue[]>(() => props.message.issues)
const hasErrors = computed(() => messageIssues.value.some((i) => i.severity === 'error'))
const hasWarnings = computed(
  () => messageIssues.value.some((i) => i.severity === 'warning') && !hasErrors.value,
)
</script>

<template>
  <div
    class="border rounded-lg overflow-hidden"
    :class="{
      'border-red-200 dark:border-red-900/50': hasErrors,
      'border-amber-200 dark:border-amber-900/50': hasWarnings,
    }"
  >
    <div class="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b text-xs select-none">
      <span class="font-mono font-bold text-primary">{{ message.type }}</span>
      <span class="text-muted-foreground">{{ message.label }}</span>
      <!-- Message-level issues -->
      <span
        v-if="messageIssues.length > 0"
        class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
        :class="{
          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': hasErrors,
          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': hasWarnings,
        }"
        >{{ messageIssues.length }} issue{{ messageIssues.length > 1 ? 's' : '' }}</span
      >
      <span class="ml-auto text-muted-foreground/60 tabular-nums"
        >{{ message.segments.length }} segments</span
      >
    </div>
    <!-- Message-level issue details -->
    <div
      v-if="messageIssues.length > 0"
      class="select-none px-3 py-1.5 border-b bg-red-50/50 dark:bg-red-950/20 text-xs space-y-0.5"
    >
      <div v-for="(iss, issIdx) in messageIssues" :key="issIdx" class="flex items-start gap-1.5">
        <span
          class="shrink-0"
          :class="{
            'text-red-500': iss.severity === 'error',
            'text-amber-500': iss.severity === 'warning',
            'text-sky-500': iss.severity === 'info',
          }"
          >●</span
        >
        <span class="text-muted-foreground">{{ iss.message }}</span>
      </div>
    </div>
    <div class="py-0.5">
      <SegmentLine v-for="(seg, segIdx) in message.segments" :key="segIdx" :segment="seg" />
    </div>
  </div>
</template>
