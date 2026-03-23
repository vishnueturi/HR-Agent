import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { ChatArea } from '../components/ChatArea';

function isEmbeddedInHrPortal(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => !isEmbeddedInHrPortal());

  return (
    <div className="h-screen flex overflow-hidden bg-background text-foreground">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} sidebarOpen={sidebarOpen} />
        <ChatArea />
      </div>
    </div>
  );
}
