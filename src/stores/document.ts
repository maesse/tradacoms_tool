import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { parseDocument, type ParsedTransmission } from '@/parser'

export const useDocumentStore = defineStore('document', () => {
  const rawDocument = ref('')

  const parsed = computed<ParsedTransmission | null>(() => {
    if (!rawDocument.value) return null
    return parseDocument(rawDocument.value)
  })

  function setDocument(content: string) {
    rawDocument.value = content
  }

  function clearDocument() {
    rawDocument.value = ''
  }

  return { rawDocument, parsed, setDocument, clearDocument }
})
