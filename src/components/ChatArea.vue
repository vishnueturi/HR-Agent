<template>
  <div class="flex-1 flex flex-col overflow-hidden relative">
    <!-- Drag and drop overlay -->
    <div
      v-if="isDragOver"
      class="absolute inset-0 z-50 flex items-center justify-center"
      :style="{
        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(4px)'
      }"
      @drop.prevent="handleDrop"
      @dragover.prevent
      @dragleave="handleDragLeave"
    >
      <div class="text-center">
        <div class="mb-4">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" class="mx-auto">
            <circle cx="32" cy="32" r="30" :stroke="isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'" stroke-width="2" stroke-dasharray="4 4"/>
            <path d="M32 20v24M20 32h24" :stroke="isDark ? 'white' : 'black'" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </div>
        <p :style="{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--foreground)' }">
          Drop files here to attach
        </p>
      </div>
    </div>

    <!-- Chat messages area -->
    <div 
      class="flex-1 overflow-y-auto" 
      ref="chatScrollRef" 
      @scroll="handleScroll"
      @drop.prevent="handleDrop"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <div class="max-w-3xl mx-auto px-4 py-8">
        <div v-for="message in messages" :key="message.id" class="mb-8">
          <!-- User message -->
          <div v-if="message.type === 'user'" class="flex items-start gap-4">
            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" :style="{ backgroundColor: 'var(--primary)' }">
              <span :style="{ color: 'var(--primary-foreground)', fontSize: 'var(--text-base)' }">U</span>
            </div>
            <div class="flex-1 pt-1">
              <div :style="{ fontSize: 'var(--text-base)', color: 'var(--foreground)' }">
                {{ message.content }}
              </div>
            </div>
          </div>

          <!-- Assistant message -->
          <div v-else class="flex items-start gap-4">
            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" :style="{ backgroundColor: 'var(--accent)' }">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L10.5 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H5.5L8 1Z" fill="currentColor" :style="{ color: 'var(--accent-foreground)' }" />
              </svg>
            </div>
            <div class="flex-1 pt-1">
              <div :style="{ fontSize: 'var(--text-base)', color: 'var(--foreground)', lineHeight: '1.7' }">
                {{ message.content }}
              </div>
              <!-- Action buttons -->
              <div class="flex items-center gap-2 mt-3">
                <button class="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/20 transition-colors" title="Copy">
                  <Copy :size="14" :style="{ color: 'var(--foreground)', opacity: 0.6 }" />
                </button>
                <button class="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/20 transition-colors" title="Regenerate">
                  <RotateCw :size="14" :style="{ color: 'var(--foreground)', opacity: 0.6 }" />
                </button>
                <button class="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/20 transition-colors" title="Like">
                  <ThumbsUp :size="14" :style="{ color: 'var(--foreground)', opacity: 0.6 }" />
                </button>
                <button class="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/20 transition-colors" title="Dislike">
                  <ThumbsDown :size="14" :style="{ color: 'var(--foreground)', opacity: 0.6 }" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll to bottom button -->
    <div
      v-if="showScrollButton"
      class="absolute bottom-32 left-1/2 transform -translate-x-1/2"
    >
      <button
        @click="scrollToBottom"
        class="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
        :style="{
          backgroundColor: 'var(--card)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)'
        }"
      >
        <ArrowDown :size="18" :style="{ color: 'var(--foreground)' }" />
      </button>
    </div>

    <!-- Input box at bottom -->
    <div class="p-4">
      <div class="max-w-3xl mx-auto">
        <div 
          :class="`flex flex-col gap-3 px-4 py-3 ${attachedFiles.length > 0 ? 'rounded-3xl' : 'rounded-full'}`"
          :style="{ 
            backgroundColor: 'var(--card)', 
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)'
          }"
        >
          <!-- Attachment previews -->
          <div 
            v-if="attachedFiles.length > 0"
            class="flex items-center gap-2 overflow-x-auto pb-1"
          >
            <div 
              v-for="(attachment, index) in attachedFiles"
              :key="index"
              class="flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0"
              :style="{
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)'
              }"
            >
              <ImageIcon v-if="attachment.type === 'image'" :size="14" :style="{ color: 'var(--foreground)', opacity: 0.7 }" />
              <FileText v-else :size="14" :style="{ color: 'var(--foreground)', opacity: 0.7 }" />
              <span class="text-xs max-w-[120px] truncate" :style="{ color: 'var(--foreground)' }">
                {{ attachment.file.name }}
              </span>
              <button
                @click="removeAttachment(index)"
                class="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
                :style="{
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
                }"
                title="Remove"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" :style="{ color: 'var(--foreground)' }" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Voice listening mode -->
          <div v-if="isListening" class="flex items-center gap-3">
            <button class="flex-shrink-0 hover:opacity-70 transition-opacity">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" :style="{ color: 'var(--foreground)' }">
                <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            
            <!-- Waveform visualization -->
            <div class="flex-1 flex items-center justify-center gap-0.5 h-10 overflow-hidden">
              <div 
                v-for="(level, i) in audioLevels"
                :key="i"
                class="flex-shrink-0"
                :style="{
                  width: '2px',
                  height: `${Math.max(level, 5)}%`,
                  backgroundColor: 'var(--foreground)',
                  borderRadius: '1px',
                  transition: 'height 0.1s ease',
                  opacity: 0.7
                }"
              />
            </div>

            <!-- Cancel and Confirm buttons -->
            <button 
              @click="handleCancelVoice"
              class="flex-shrink-0 hover:opacity-70 transition-opacity"
              title="Cancel"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" :style="{ color: 'var(--foreground)' }">
                <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <button 
              @click="handleConfirmVoice"
              class="flex-shrink-0 hover:opacity-70 transition-opacity"
              title="Confirm"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" :style="{ color: 'var(--foreground)' }">
                <path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <!-- Normal input mode -->
          <div v-else class="flex items-center gap-3">
            <div class="relative" ref="attachButtonRef">
              <button 
                @click="toggleAttachMenu"
                class="flex-shrink-0 hover:opacity-70 transition-opacity" 
                title="Add attachment"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" :style="{ color: 'var(--foreground)' }">
                  <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
              <div 
                v-if="showAttachMenu"
                class="absolute bottom-full mb-2 left-0 rounded-lg" 
                :style="{ 
                  backgroundColor: 'var(--card)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  minWidth: '220px'
                }"
              >
                <div class="py-1">
                  <button 
                    @click="handleAddFiles"
                    class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                    :style="{ fontSize: 'var(--text-sm)', color: 'var(--foreground)' }"
                  >
                    <Paperclip :size="16" :style="{ opacity: 0.7 }" />
                    <span>Add photos & files</span>
                    <span :style="{ marginLeft: 'auto', opacity: 0.5, fontSize: 'var(--text-xs)' }">⌘U</span>
                  </button>
                </div>
              </div>
            </div>
            <input
              v-model="inputValue"
              @keypress.enter="handleSend"
              type="text"
              placeholder="Ask anything"
              class="flex-1 bg-transparent outline-none placeholder:opacity-50"
              :style="{ 
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-source-sans-pro)',
                color: 'var(--foreground)' 
              }"
            />
            <div class="flex items-center gap-2">
              <button 
                @click="handleMicClick"
                class="flex-shrink-0 hover:opacity-70 transition-opacity" 
                title="Voice input"
              >
                <Mic :size="20" :style="{ color: 'var(--foreground)' }" />
              </button>
              <button 
                v-if="inputValue.trim() || attachedFiles.length > 0"
                @click="handleSend"
                class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-90"
                :style="{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }"
                title="Send message"
              >
                <ArrowUp :size="18" />
              </button>
              <button 
                v-else
                class="flex-shrink-0 w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity" 
                title="Audio waveform"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" :style="{ color: 'var(--foreground)' }">
                  <rect x="3" y="7" width="2" height="6" rx="1" fill="currentColor"/>
                  <rect x="7" y="4" width="2" height="12" rx="1" fill="currentColor"/>
                  <rect x="11" y="6" width="2" height="8" rx="1" fill="currentColor"/>
                  <rect x="15" y="5" width="2" height="10" rx="1" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/*,.pdf,.doc,.docx,.txt"
      @change="handleFileSelect"
      style="display: none"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useStore } from 'vuex';
import { 
  Mic, ArrowUp, ArrowDown, Copy, RotateCw, ThumbsUp, ThumbsDown, 
  FileText, Image as ImageIcon, Paperclip 
} from 'lucide-vue-next';
import type { Message, FileAttachment } from '../store';

const store = useStore();

const isDark = computed(() => store.getters.isDark);
const messages = computed(() => store.getters.messages);
const attachedFiles = computed(() => store.getters.attachedFiles);

const inputValue = ref('');
const isListening = ref(false);
const audioLevels = ref<number[]>([]);
const showAttachMenu = ref(false);
const showScrollButton = ref(false);
const isDragOver = ref(false);

const chatScrollRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const attachButtonRef = ref<HTMLElement | null>(null);

let animationFrameId: number | null = null;
let lastTime = Date.now();

// Voice animation
const startVoiceAnimation = () => {
  if (isListening.value) {
    const now = Date.now();
    if (now - lastTime > 50) {
      const newBar = Math.random() * 70 + 20;
      audioLevels.value = [newBar, ...audioLevels.value].slice(0, 60);
      lastTime = now;
    }
    animationFrameId = requestAnimationFrame(startVoiceAnimation);
  }
};

const handleMicClick = () => {
  isListening.value = true;
  audioLevels.value = [];
  lastTime = Date.now();
  startVoiceAnimation();
};

const handleConfirmVoice = () => {
  inputValue.value = 'This is a simulated transcription of your speech. In a real application, this would use the Web Speech API to convert your voice to text.';
  isListening.value = false;
  audioLevels.value = [];
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
};

const handleCancelVoice = () => {
  isListening.value = false;
  audioLevels.value = [];
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
};

const toggleAttachMenu = () => {
  showAttachMenu.value = !showAttachMenu.value;
};

const handleAddFiles = () => {
  showAttachMenu.value = false;
  setTimeout(() => {
    fileInputRef.value?.click();
  }, 100);
};

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = file.type.startsWith('image/') ? 'image' : 'document';
      store.dispatch('addAttachment', { file, type });
    }
  }
  // Reset input
  target.value = '';
};

const removeAttachment = (index: number) => {
  store.dispatch('removeAttachment', index);
};

const handleSend = () => {
  if (inputValue.value.trim() || attachedFiles.value.length > 0) {
    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.value,
      timestamp: new Date(),
    };
    store.dispatch('addMessage', newMessage);
    
    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'This is a simulated response from the HR Agent. In a real application, this would connect to an AI backend to provide actual HR assistance.',
        timestamp: new Date(),
      };
      store.dispatch('addMessage', assistantMessage);
      scrollToBottom();
    }, 1000);
    
    inputValue.value = '';
    store.dispatch('clearAttachments');
    scrollToBottom();
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
    }
  });
};

const handleScroll = () => {
  if (chatScrollRef.value) {
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.value;
    showScrollButton.value = scrollHeight - scrollTop - clientHeight > 200;
  }
};

// Drag and drop handlers
const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  if (e.target === e.currentTarget) {
    isDragOver.value = false;
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragOver.value = false;
  
  const files = e.dataTransfer?.files;
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = file.type.startsWith('image/') ? 'image' : 'document';
      store.dispatch('addAttachment', { file, type });
    }
  }
};

// Click outside to close attach menu
const handleClickOutside = (e: MouseEvent) => {
  if (attachButtonRef.value && !attachButtonRef.value.contains(e.target as Node)) {
    showAttachMenu.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
  scrollToBottom();
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>
