<script setup lang="ts">
import { ref, onBeforeUnmount, watch } from 'vue'
import { PopoverRoot, PopoverContent, PopoverPortal, PopoverAnchor } from 'reka-ui'
import { onClickOutside } from '@vueuse/core'

defineProps<{
  /** Show on top or bottom */
  side?: 'top' | 'bottom' | 'left' | 'right'
}>()

// ─── Shared state: only one pinned tooltip at a time ───
let globalPinnedInstance: (() => void) | null = null

const isOpen = ref(false)
const isPinned = ref(false)
const contentRef = ref<HTMLElement | null>(null)
let hoverTimeout: ReturnType<typeof setTimeout> | null = null

function onMouseEnter() {
  if (isPinned.value) return
  hoverTimeout = setTimeout(() => {
    // If another instance is pinned, don't show hover tooltip
    if (globalPinnedInstance && globalPinnedInstance !== unpin) return
    isOpen.value = true
  }, 0)
}

function onMouseLeave() {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout)
    hoverTimeout = null
  }
  if (!isPinned.value) {
    isOpen.value = false
  }
}

function onClick() {
  // Unpin the currently pinned instance (if different)
  if (globalPinnedInstance && globalPinnedInstance !== unpin) {
    globalPinnedInstance()
  }
  isPinned.value = true
  isOpen.value = true
  globalPinnedInstance = unpin
}

function unpin() {
  isPinned.value = false
  isOpen.value = false
  if (globalPinnedInstance === unpin) {
    globalPinnedInstance = null
  }
}

onClickOutside(
  contentRef,
  () => {
    if (isPinned.value) {
      unpin()
    }
  },
  { ignore: ['.field-tooltip-trigger'] },
)

onBeforeUnmount(() => {
  if (globalPinnedInstance === unpin) {
    globalPinnedInstance = null
  }
  if (hoverTimeout) clearTimeout(hoverTimeout)
})

// When open changes to false externally, clear pinned
watch(isOpen, (val) => {
  if (!val) isPinned.value = false
})
</script>

<template>
  <PopoverRoot :open="isOpen">
    <PopoverAnchor as-child>
      <span
        class="field-tooltip-trigger"
        @mouseenter="onMouseEnter"
        @mouseleave="onMouseLeave"
        @click.stop="onClick"
      >
        <slot />
      </span>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        ref="contentRef"
        :side="side ?? 'bottom'"
        :side-offset="6"
        :align="'start'"
        class="max-w-sm p-0 bg-popover text-popover-foreground border shadow-lg rounded-lg overflow-hidden z-50 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
        :class="{ 'ring-2 ring-primary/30': isPinned }"
        @mouseenter="onMouseEnter"
        @mouseleave="onMouseLeave"
        @open-auto-focus.prevent
      >
        <slot name="content" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
