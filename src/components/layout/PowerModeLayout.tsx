import { useState } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { JaceStyleInbox } from '@/components/conversations/JaceStyleInbox';
import { ConversationThread } from '@/components/conversations/ConversationThread';
import { CustomerContext } from '@/components/context/CustomerContext';
import { Conversation } from '@/lib/types';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { MessageSquare } from 'lucide-react';

interface PowerModeLayoutProps {
  filter?: 'my-tickets' | 'unassigned' | 'sla-risk' | 'all-open' | 'awaiting-reply' | 'completed' | 'sent' | 'high-priority' | 'vip-customers' | 'escalations' | 'triaged' | 'needs-me' | 'snoozed' | 'cleared' | 'fyi';
  channelFilter?: string;
}

export const PowerModeLayout = ({ filter = 'all-open', channelFilter }: PowerModeLayoutProps) => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUpdate = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar - width controlled by Sidebar component itself (hidden on mobile) */}
      <aside className="hidden md:flex border-r border-border bg-card flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Main Content */}
      {!selectedConversation ? (
        /* When nothing is selected, show just the inbox (no empty 2nd/3rd panels) */
        <main className="flex-1 min-h-0 h-full overflow-hidden">
          <div className="h-full w-full border-r border-border/30 bg-card overflow-hidden min-w-0">
            <JaceStyleInbox
              filter={filter}
              onSelect={setSelectedConversation}
            />
          </div>
        </main>
      ) : (
        /* When selected, show the full 3-column power layout */
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 h-full overflow-hidden">
          {/* Conversation List Panel */}
          <ResizablePanel 
            defaultSize={35} 
            minSize={30}
            maxSize={50}
            collapsible={false}
            className="flex min-h-0"
          >
            <div className="flex-1 flex flex-col border-r border-border/30 bg-card w-full overflow-hidden min-w-0">
              <JaceStyleInbox
                filter={filter}
                onSelect={setSelectedConversation}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-1 bg-border/50 hover:bg-border transition-colors hidden md:block" />

          {/* Conversation Thread Panel */}
          <ResizablePanel 
            defaultSize={45} 
            minSize={35}
            maxSize={60}
            collapsible={false}
            className="w-full min-h-0 flex flex-col h-full min-w-0"
          >
            <div className="h-full w-full min-h-0 overflow-hidden min-w-0">
              <ConversationThread
                key={refreshKey}
                conversation={selectedConversation}
                onUpdate={handleUpdate}
                onBack={() => setSelectedConversation(null)}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-1 bg-border/50 hover:bg-border transition-colors hidden md:block" />

          {/* Customer Context Panel */}
          <ResizablePanel 
            defaultSize={20} 
            minSize={18}
            maxSize={35}
            collapsible={false}
            className="hidden md:flex min-h-0"
          >
            <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden bg-card/50 p-5 hidden md:flex min-w-0">
              <CustomerContext conversation={selectedConversation} onUpdate={handleUpdate} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
};
