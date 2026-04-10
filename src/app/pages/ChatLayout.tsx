import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { ChatArea } from '../components/ChatArea';
import { useIsMobile } from '../components/ui/use-mobile';

function isEmbeddedInHrPortal(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => !isEmbeddedInHrPortal());
  const isMobile = useIsMobile();

  return (
    <div className="relative h-[100dvh] min-h-0 flex overflow-hidden bg-background text-foreground transition-[background-color,color] duration-300 ease-out">
      {isMobile && sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px] md:hidden motion-safe:transition-opacity"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        isMobile={isMobile}
        onRequestClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[background-color] duration-300 ease-out">
        <ChatHeader
          showSidebarTrigger={isMobile}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <ChatArea />
      </div>
    </div>
  );
}
