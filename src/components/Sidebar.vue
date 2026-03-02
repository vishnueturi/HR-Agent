<template>
  <aside 
    class="h-screen flex flex-col"
    :style="{ 
      width: isOpen ? '260px' : '0px',
      transition: 'width 0.3s ease',
      overflow: 'hidden',
      backgroundColor: 'var(--sidebar)',
      boxShadow: '2px 0 8px rgba(0, 0, 0, 0.05)',
      borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)'
    }"
  >
    <!-- Top section -->
    <div class="p-3 flex items-center gap-3">
      <button 
        @click="toggleSidebar"
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/10 transition-colors"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" :style="{ color: 'var(--sidebar-foreground)' }">
          <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.9"/>
          <path d="M8 10h8M8 14h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="hover:opacity-70 transition-opacity" :style="{ color: 'var(--sidebar-foreground)' }">
        <span :style="{ fontSize: 'var(--text-xl)', fontFamily: 'var(--font-source-sans-pro)', fontWeight: 'var(--font-weight-bold)' }">HR Agent</span>
      </button>
    </div>

    <!-- Navigation items -->
    <nav class="flex-1 overflow-y-auto px-2">
      <button
        v-for="(item, index) in navItems"
        :key="index"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors group"
      >
        <component 
          :is="item.icon" 
          :size="18" 
          :style="{ color: 'var(--sidebar-foreground)', opacity: 0.8 }"
        />
        <span :style="{ fontSize: 'var(--text-base)', color: 'var(--sidebar-foreground)' }">
          {{ item.label }}
        </span>
      </button>

      <!-- GPTs Section -->
      <div class="mt-6">
        <!-- GPTs hidden for now -->
      </div>

      <!-- Projects Section -->
      <div class="mt-6 mb-4">
        <button
          v-for="(project, index) in projects"
          :key="index"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors group"
        >
          <MessageSquare :size="18" :style="{ color: 'var(--sidebar-foreground)', opacity: 0.7 }" />
          <span class="flex-1 text-left truncate" :style="{ fontSize: 'var(--text-base)', color: 'var(--sidebar-foreground)' }">
            {{ project.label }}
          </span>
          <span 
            v-if="project.hasPlus"
            class="px-1.5 py-0.5 rounded" 
            :style="{ 
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-foreground)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-semibold)'
            }"
          >
            Plus
          </span>
        </button>
      </div>
    </nav>

    <!-- Bottom section with theme toggle and user profile -->
    <div class="p-3">
      <!-- Theme toggle button -->
      <button 
        @click="toggleTheme"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors mb-2"
        :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        <Sun v-if="isDark" :size="18" :style="{ color: 'var(--sidebar-foreground)', opacity: 0.8 }" />
        <Moon v-else :size="18" :style="{ color: 'var(--sidebar-foreground)', opacity: 0.8 }" />
        <span :style="{ fontSize: 'var(--text-base)', color: 'var(--sidebar-foreground)' }">
          {{ isDark ? 'Light mode' : 'Dark mode' }}
        </span>
      </button>

      <!-- User profile -->
      <button class="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors">
        <div 
          class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" 
          :style="{ backgroundColor: 'var(--primary)' }"
        >
          <span :style="{ color: 'var(--primary-foreground)', fontSize: 'var(--text-base)', fontWeight: 'var(--font-weight-semibold)' }">
            JD
          </span>
        </div>
        <div class="flex-1 text-left">
          <div :style="{ fontSize: 'var(--text-base)', color: 'var(--sidebar-foreground)' }">
            John Doe
          </div>
          <div :style="{ fontSize: 'var(--text-xs)', color: 'var(--sidebar-foreground)', opacity: 0.6 }">
            john.doe@example.com
          </div>
        </div>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from 'vuex';
import { MessageSquarePlus, Search, MessageSquare, Sun, Moon } from 'lucide-vue-next';

const store = useStore();

const isDark = computed(() => store.getters.isDark);
const isOpen = computed(() => store.getters.sidebarOpen);

const toggleTheme = () => {
  store.dispatch('toggleTheme');
};

const toggleSidebar = () => {
  store.dispatch('toggleSidebar');
};

const navItems = [
  { icon: MessageSquarePlus, label: 'New chat', active: false },
  { icon: Search, label: 'Search chats', active: false },
];

const projects = [
  { label: 'New project', hasPlus: false },
  { label: 'HRAgent', hasPlus: false },
  { label: 'HRMSUPGRADE', hasPlus: false },
  { label: 'Application development', hasPlus: false },
  { label: 'Product Team', hasPlus: false },
  { label: 'Market Research', hasPlus: false },
  { label: 'srl kanth', hasPlus: true },
];
</script>
