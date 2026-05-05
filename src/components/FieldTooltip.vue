<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

defineProps<{
  /** Show on top or bottom */
  side?: 'top' | 'bottom' | 'left' | 'right'
}>()
</script>

<template>
  <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
    <Tooltip>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent
        :side="side ?? 'bottom'"
        :side-offset="6"
        class="max-w-sm p-0 bg-popover text-popover-foreground border shadow-lg rounded-lg overflow-hidden"
      >
        <slot name="content" />
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
