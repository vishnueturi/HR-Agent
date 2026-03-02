<template>
  <header class="px-4 py-3 flex items-center justify-between" :style="{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }">
    <div class="flex items-center gap-3">
      <button 
        v-if="!sidebarOpen"
        @click="toggleSidebar"
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/20 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="4" width="14" height="2" rx="1" fill="currentColor"/>
          <rect x="3" y="9" width="14" height="2" rx="1" fill="currentColor"/>
          <rect x="3" y="14" width="14" height="2" rx="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/20 transition-colors">
        <span :style="{ fontSize: 'var(--text-base)' }">Screen Shot to Code 5.2</span>
        <ChevronDown :size="16" />
      </button>
    </div>
    <div class="flex items-center gap-2">
      <button class="px-3 py-1.5 rounded hover:bg-muted/20 transition-colors flex items-center gap-2">
        <Share2 :size="16" />
        <span :style="{ fontSize: 'var(--text-base)' }">Share</span>
      </button>
      <button class="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/20 transition-colors">
        <MoreHorizontal :size="18" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from 'vuex';
import { Share2, MoreHorizontal, ChevronDown } from 'lucide-vue-next';

const store = useStore();

const sidebarOpen = computed(() => store.getters.sidebarOpen);

const toggleSidebar = () => {
  store.dispatch('toggleSidebar');
};
</script>
