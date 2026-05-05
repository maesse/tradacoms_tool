<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ParsedSegment, ParsedElement, ParsedSubElement, ValidationIssue } from '@/parser'
import { describeFormat, getImpliedDecimalPlaces, formatWithDecimal } from '@/parser'
import { useFieldHighlight } from '@/composables/useFieldHighlight'
import FieldTooltip from './FieldTooltip.vue'

const props = defineProps<{
  segment: ParsedSegment
}>()

const { setHovered, isHighlighted } = useFieldHighlight()

/** Track which element index is being hovered for composite group highlight */
const hoveredElIdx = ref<number | null>(null)

const allIssues = computed<ValidationIssue[]>(() => {
  const issues: ValidationIssue[] = [...props.segment.issues]
  for (const el of props.segment.elements) {
    issues.push(...el.issues)
    for (const sub of el.subElements) {
      issues.push(...sub.issues)
    }
  }
  return issues
})

const hasErrors = computed(() => allIssues.value.some(i => i.severity === 'error'))
const hasWarnings = computed(() => allIssues.value.some(i => i.severity === 'warning'))

function getSegmentLabel(): string {
  if (props.segment.def) {
    return props.segment.def.name
  }
  return props.segment.tag
}

function subHasIssue(sub: ParsedSubElement): boolean {
  return sub.issues.length > 0
}

function subIssueSeverity(sub: ParsedSubElement): string {
  if (sub.issues.some(i => i.severity === 'error')) return 'error'
  if (sub.issues.some(i => i.severity === 'warning')) return 'warning'
  return 'info'
}

function getDecimalPlaces(sub: ParsedSubElement): number {
  return sub.def ? getImpliedDecimalPlaces(sub.def.format) : 0
}

function getDisplayValue(sub: ParsedSubElement): string {
  if (!sub.raw) return ''
  const dp = getDecimalPlaces(sub)
  if (dp > 0) {
    const formatted = formatWithDecimal(sub.raw, dp)
    if (formatted) return formatted
  }
  return sub.raw
}

function isDecimalFormatted(sub: ParsedSubElement): boolean {
  if (!sub.raw) return false
  const dp = getDecimalPlaces(sub)
  if (dp > 0) {
    return formatWithDecimal(sub.raw, dp) !== null
  }
  return false
}

/**
 * Get the webmethods-style field reference for an element.
 * e.g., STL01, ILD03. Counter is 1-based from element index.
 * Composite sub-fields share the same counter.
 */
function getFieldRef(el: ParsedElement): string {
  const tag = props.segment.tag
  const num = String(el.index + 1).padStart(2, '0')
  return `${tag}${num}`
}

function onSubEnter(sub: ParsedSubElement, elIdx: number) {
  setHovered(sub.raw)
  hoveredElIdx.value = elIdx
}

function onSubLeave() {
  setHovered(null)
  hoveredElIdx.value = null
}

function isElementEmpty(el: ParsedElement): boolean {
  return el.subElements.every(s => s.raw === '')
}

function getElementPreview(elIdx: number): string {
  const el = props.segment.elements[elIdx]
  if (!el) return ''
  const parts = el.subElements.map(s => s.raw).filter(Boolean)
  const joined = parts.join(':')
  return joined.length > 12 ? joined.slice(0, 11) + '…' : joined
}
</script>

<template>
  <div
    class="group flex items-baseline py-0.5 px-2 font-mono text-sm leading-7 rounded relative transition-colors hover:bg-muted/50"
    :class="{
      'border-l-2 border-l-red-500': hasErrors,
      'border-l-2 border-l-amber-400': !hasErrors && hasWarnings,
    }"
  >
    <!-- Segment tag -->
    <FieldTooltip>
      <span class="font-bold text-primary cursor-default">{{ segment.tag }}</span>
      <template #content>
        <div class="px-3 py-2 space-y-1.5 min-w-[260px] max-w-md">
          <div class="font-semibold text-sm">{{ segment.def?.name ?? segment.tag }}</div>
          <div v-if="segment.def?.description" class="text-xs text-muted-foreground">{{ segment.def.description }}</div>
          <div class="flex gap-2 text-xs mt-1">
            <span class="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
              :class="segment.def?.requirement === 'M' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'">
              {{ segment.def?.requirement === 'M' ? 'Required' : 'Optional' }}
            </span>
            <span v-if="segment.def?.repeat" class="text-muted-foreground">{{ segment.def.repeat }}</span>
          </div>

          <!-- List all fields -->
          <div v-if="segment.def" class="border-t pt-1.5 mt-1.5 space-y-0.5">
            <div
              v-for="(elDef, eIdx) in segment.def.elements"
              :key="eIdx"
              class="flex items-baseline gap-2 text-xs py-0.5"
            >
              <span class="font-mono text-primary/70 shrink-0 w-10">{{ segment.tag }}{{ String(eIdx + 1).padStart(2, '0') }}</span>
              <span class="font-medium shrink-0">{{ elDef.code }}</span>
              <span class="text-muted-foreground truncate">{{ elDef.name }}</span>
              <span
                v-if="segment.elements[eIdx] && !isElementEmpty(segment.elements[eIdx]!)"
                class="ml-auto font-mono text-[10px] text-foreground/70 max-w-[80px] truncate shrink-0"
              >{{ getElementPreview(eIdx) }}</span>
              <span
                v-else-if="elDef.requirement === 'M'"
                class="ml-auto text-[10px] text-red-500"
              >empty</span>
            </div>
          </div>

          <div v-if="segment.issues.length" class="border-t pt-1 mt-1 space-y-0.5">
            <div v-for="(iss, i) in segment.issues" :key="i" class="flex items-start gap-1 text-xs">
              <span :class="iss.severity === 'error' ? 'text-red-500' : iss.severity === 'warning' ? 'text-amber-500' : 'text-sky-500'">●</span>
              <span>{{ iss.message }}</span>
            </div>
          </div>
        </div>
      </template>
    </FieldTooltip>

    <span class="text-zinc-400">=</span>

    <!-- Elements -->
    <template v-for="(el, elIdx) in segment.elements" :key="elIdx">
      <span v-if="elIdx > 0" class="text-zinc-400">+</span>

      <!-- Composite group wrapper -->
      <span
        class="inline-flex items-baseline rounded-sm transition-colors"
        :class="{
          'bg-primary/5 outline outline-1 outline-primary/20': hoveredElIdx === elIdx && el.subElements.length > 1,
        }"
      >
        <!-- Sub-elements within each element -->
        <template v-for="(sub, subIdx) in el.subElements" :key="subIdx">
          <span v-if="subIdx > 0" class="text-zinc-300 dark:text-zinc-600">:</span>

          <FieldTooltip>
            <span
              class="rounded-sm px-0.5 transition-colors cursor-default"
              :class="{
                'min-w-[0.5ch] inline-block': sub.raw === '',
                'text-foreground font-medium': sub.def?.requirement === 'M' && !subHasIssue(sub) && sub.raw !== '',
                'text-zinc-500 dark:text-zinc-400': sub.def?.requirement !== 'M' && !subHasIssue(sub) && sub.raw !== '',
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': subHasIssue(sub) && subIssueSeverity(sub) === 'error',
                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': subHasIssue(sub) && subIssueSeverity(sub) === 'warning',
                'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400': subHasIssue(sub) && subIssueSeverity(sub) === 'info',
                'hover:bg-sky-50 dark:hover:bg-sky-900/20': !subHasIssue(sub) && !isHighlighted(sub.raw),
                'ring-2 ring-primary/40 bg-primary/10': sub.raw !== '' && isHighlighted(sub.raw),
              }"
              @mouseenter="onSubEnter(sub, elIdx)"
              @mouseleave="onSubLeave()"
            ><template v-if="isDecimalFormatted(sub)"><span class="tabular-nums">{{ getDisplayValue(sub).split('.')[0] }}</span><span class="select-none text-emerald-600 dark:text-emerald-400 font-bold">.</span><span class="tabular-nums">{{ getDisplayValue(sub).split('.')[1] }}</span></template><template v-else-if="sub.raw">{{ sub.raw }}</template><template v-else>&nbsp;</template></span>

            <template #content>
              <div class="px-3 py-2 space-y-1.5 min-w-[200px]">
                <!-- Field ref + name -->
                <div class="flex items-baseline gap-2">
                  <span class="font-mono text-xs text-primary/80 bg-primary/10 rounded px-1.5 py-0.5 select-none">{{ getFieldRef(el) }}</span>
                  <span class="font-semibold text-sm">{{ sub.def?.name ?? `Field ${sub.index + 1}` }}</span>
                </div>

                <!-- Element context -->
                <div v-if="el.def" class="text-xs text-muted-foreground">
                  {{ el.def.code }} – {{ el.def.name }}
                </div>

                <!-- Description -->
                <div v-if="sub.def?.description" class="text-xs text-muted-foreground leading-relaxed">{{ sub.def.description }}</div>

                <!-- Format & requirement badges -->
                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
                    :class="sub.def?.requirement === 'M' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'">
                    {{ sub.def?.requirement === 'M' ? 'Required' : 'Optional' }}
                  </span>
                  <span v-if="sub.def?.format" class="inline-flex items-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 font-medium">
                    {{ describeFormat(sub.def.format, sub.def.lengthType) }}
                  </span>
                </div>

                <!-- Raw TRADACOMS notation -->
                <div v-if="sub.def?.format" class="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                  TRADACOMS: {{ sub.def.format.notation }}{{ sub.def.lengthType === 'F' ? ' (fixed)' : '' }}
                </div>

                <!-- Current value display with decimal interpretation -->
                <div v-if="sub.raw" class="border-t pt-1.5 mt-1">
                  <div class="text-xs text-muted-foreground">Current value</div>
                  <div class="font-mono text-sm font-medium mt-0.5">
                    <span v-if="isDecimalFormatted(sub)" class="text-emerald-700 dark:text-emerald-400">{{ getDisplayValue(sub) }}</span>
                    <span v-else>{{ sub.raw }}</span>
                  </div>
                  <div v-if="isDecimalFormatted(sub)" class="text-[10px] text-muted-foreground/70 mt-0.5">
                    Raw: {{ sub.raw }} ({{ getImpliedDecimalPlaces(sub.def!.format) }} implied decimal places)
                  </div>
                </div>

                <!-- Issues -->
                <div v-if="sub.issues.length" class="border-t pt-1.5 mt-1 space-y-0.5">
                  <div v-for="(iss, i) in sub.issues" :key="i" class="flex items-start gap-1 text-xs">
                    <span :class="iss.severity === 'error' ? 'text-red-500' : iss.severity === 'warning' ? 'text-amber-500' : 'text-sky-500'">●</span>
                    <span>{{ iss.message }}</span>
                  </div>
                </div>
              </div>
            </template>
          </FieldTooltip>
        </template>
      </span>
    </template>

    <span class="text-zinc-300 dark:text-zinc-600">'</span>

    <!-- Issue count badge -->
    <span
      v-if="allIssues.length > 0"
      class="ml-2 select-none text-[10px] leading-none px-1.5 py-0.5 rounded-full font-medium"
      :class="{
        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': hasErrors,
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': !hasErrors && hasWarnings,
      }"
    >{{ allIssues.length }}</span>

    <!-- Segment label (shows on hover) -->
    <span class="ml-4 select-none text-xs text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{{ getSegmentLabel() }}</span>
  </div>
</template>
