<script setup lang="ts">
import { computed } from 'vue'
import { useDocumentStore } from '@/stores/document'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ValidationIssue, ParsedSegment } from '@/parser'
import SegmentLine from './SegmentLine.vue'
import MessageGroup from './MessageGroup.vue'

const store = useDocumentStore()

/** Collect all issues across the entire transmission for a summary */
const allIssues = computed(() => {
  if (!store.parsed) return [] as ValidationIssue[]
  const issues: ValidationIssue[] = [...store.parsed.issues]

  function collectSegmentIssues(seg: ParsedSegment | null) {
    if (!seg) return
    issues.push(...seg.issues)
    for (const el of seg.elements) {
      issues.push(...el.issues)
      for (const sub of el.subElements) {
        issues.push(...sub.issues)
      }
    }
  }

  collectSegmentIssues(store.parsed.stx)
  collectSegmentIssues(store.parsed.end)

  for (const msg of store.parsed.messages) {
    issues.push(...msg.issues)
    for (const seg of msg.segments) {
      collectSegmentIssues(seg)
    }
  }
  return issues
})

const errorCount = computed(() => allIssues.value.filter((i) => i.severity === 'error').length)
const warningCount = computed(() => allIssues.value.filter((i) => i.severity === 'warning').length)
const infoCount = computed(() => allIssues.value.filter((i) => i.severity === 'info').length)
</script>

<template>
  <ScrollArea class="h-full w-full rounded-lg border bg-background">
    <div class="p-4 space-y-3" v-if="store.parsed">
      <!-- Validation Summary -->
      <div
        v-if="allIssues.length > 0"
        class="select-none rounded-lg border px-4 py-2.5 text-sm flex items-center gap-4"
        :class="{
          'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20': errorCount > 0,
          'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20':
            errorCount === 0 && warningCount > 0,
          'border-sky-200 bg-sky-50/50 dark:border-sky-900/50 dark:bg-sky-950/20':
            errorCount === 0 && warningCount === 0,
        }"
      >
        <span class="font-medium">Validation</span>
        <span v-if="errorCount > 0" class="text-red-600 dark:text-red-400 font-medium"
          >{{ errorCount }} error{{ errorCount > 1 ? 's' : '' }}</span
        >
        <span v-if="warningCount > 0" class="text-amber-600 dark:text-amber-400 font-medium"
          >{{ warningCount }} warning{{ warningCount > 1 ? 's' : '' }}</span
        >
        <span v-if="infoCount > 0" class="text-sky-600 dark:text-sky-400"
          >{{ infoCount }} info</span
        >
      </div>
      <div
        v-else
        class="select-none rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 px-4 py-2.5 text-sm flex items-center gap-2"
      >
        <span class="text-emerald-600 dark:text-emerald-400">✓</span>
        <span class="font-medium text-emerald-700 dark:text-emerald-400">No issues found</span>
      </div>

      <!-- Document-level issues -->
      <div
        v-if="store.parsed.issues.length > 0"
        class="select-none rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20 px-4 py-2 text-xs space-y-1"
      >
        <div class="font-medium text-red-700 dark:text-red-400 mb-1">Document Issues</div>
        <div
          v-for="(iss, idx) in store.parsed.issues"
          :key="idx"
          class="flex items-start gap-1.5 text-muted-foreground"
        >
          <span class="text-red-500 shrink-0">●</span>
          <span>{{ iss.message }}</span>
        </div>
      </div>

      <!-- STX envelope -->
      <div v-if="store.parsed.stx" class="border rounded-lg overflow-hidden">
        <div class="select-none flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b text-xs">
          <span class="font-mono font-bold text-primary">STX</span>
          <span class="text-muted-foreground">Start of Transmission</span>
        </div>
        <div class="py-0.5">
          <SegmentLine :segment="store.parsed.stx" />
        </div>
      </div>

      <!-- Messages -->
      <MessageGroup
        v-for="(msg, msgIdx) in store.parsed.messages"
        :key="msgIdx"
        :message="msg"
        :index="msgIdx"
      />

      <!-- END envelope -->
      <div v-if="store.parsed.end" class="border rounded-lg overflow-hidden">
        <div class="select-none flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b text-xs">
          <span class="font-mono font-bold text-primary">END</span>
          <span class="text-muted-foreground">End of Transmission</span>
        </div>
        <div class="py-0.5">
          <SegmentLine :segment="store.parsed.end" />
        </div>
      </div>
    </div>
  </ScrollArea>
</template>
