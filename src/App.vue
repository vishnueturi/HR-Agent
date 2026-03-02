<template>
  <div class="h-screen flex overflow-hidden bg-background text-foreground">
    <Sidebar />
    <div class="flex-1 flex flex-col overflow-hidden">
      <ChatHeader />
      <ChatArea />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useStore } from 'vuex';
import Sidebar from './components/Sidebar.vue';
import ChatHeader from './components/ChatHeader.vue';
import ChatArea from './components/ChatArea.vue';

const store = useStore();

onMounted(() => {
  // Initialize theme on mount
  store.commit('SET_THEME', true); // Start with dark theme
});
</script>

<style>
/* Ensure html and body take full height */
html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>
