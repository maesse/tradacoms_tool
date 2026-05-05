<script setup lang="ts">
import { useDocumentStore } from '@/stores/document'
import LoadDocumentDialog from '@/components/LoadDocumentDialog.vue'
import DocumentViewer from '@/components/DocumentViewer.vue'
import { Button } from '@/components/ui/button'

const store = useDocumentStore()
</script>

<template>
  <div class="flex flex-col h-screen bg-background text-foreground">
    <!-- Header -->
    <header class="select-none flex items-center justify-between border-b px-6 py-3 bg-muted/30">
      <h1 class="text-lg font-semibold tracking-tight">TRADACOMS INVFIL Tool</h1>
      <div class="flex items-center gap-2">
        <Button v-if="store.rawDocument" variant="ghost" size="sm" @click="store.clearDocument()">
          Clear
        </Button>
        <LoadDocumentDialog />
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 overflow-hidden p-6">
      <div v-if="store.rawDocument" class="h-full">
        <DocumentViewer />
      </div>
      <div v-else class="flex h-full items-center justify-center">
        <div class="text-center space-y-4">
          <p class="text-muted-foreground">No document loaded.</p>
          <LoadDocumentDialog />
        </div>
      </div>
    </main>
  </div>
</template>
