import { ref } from 'vue'

/** Globally shared hover state: when a field is hovered, store its raw value */
const hoveredValue = ref<string | null>(null)

export function useFieldHighlight() {
  function setHovered(value: string | null) {
    hoveredValue.value = value && value.trim() ? value : null
  }

  function isHighlighted(value: string): boolean {
    if (!hoveredValue.value || !value) return false
    return value === hoveredValue.value
  }

  return { hoveredValue, setHovered, isHighlighted }
}
