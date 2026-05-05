<script setup lang="ts">
import { ref } from 'vue'
import { useDocumentStore } from '@/stores/document'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const store = useDocumentStore()
const open = ref(false)
const inputText = ref('')

function handleLoad() {
  if (inputText.value.trim()) {
    store.setDocument(inputText.value)
    open.value = false
    inputText.value = ''
  }
}

function handleCancel() {
  open.value = false
  inputText.value = ''
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button>Load Document</Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Load TRADACOMS Document</DialogTitle>
        <DialogDescription>
          Paste your TRADACOMS INVFIL document below.
        </DialogDescription>
      </DialogHeader>
      <Textarea
        v-model="inputText"
        placeholder="Paste your TRADACOMS document here..."
        class="min-h-[300px] font-mono text-sm"
      />
      <DialogFooter>
        <Button variant="outline" @click="handleCancel">Cancel</Button>
        <Button @click="handleLoad" :disabled="!inputText.trim()">Load</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
