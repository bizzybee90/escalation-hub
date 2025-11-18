import { useState } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ConversationList } from '@/components/conversations/ConversationList';
import { ConversationThread } from '@/components/conversations/ConversationThread';
import { CustomerContext } from '@/components/context/CustomerContext';
import { Conversation } from '@/lib/types';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

interface PowerModeLayoutProps {
  filter?: 'my-tickets' | 'unassigned' | 'sla-risk' | 'all-open';
}

export const PowerModeLayout = ({ filter = 'all-open' }: PowerModeLayoutProps) => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUpdate = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-card flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Main Content - 3 Column Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Conversation List */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <ConversationList
            filter={filter}
            selectedId={selectedConversation?.id}
            onSelect={setSelectedConversation}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Conversation Thread */}
        <ResizablePanel defaultSize={45} minSize={30}>
          {selectedConversation ? (
            <ConversationThread
              key={refreshKey}
              conversation={selectedConversation}
              onUpdate={handleUpdate}
              onBack={() => setSelectedConversation(null)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Select a conversation to view details</p>
            </div>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Customer Context */}
        <ResizablePanel defaultSize={25} minSize={20}>
          <div className="h-full overflow-y-auto bg-card border-l border-border p-4">
            {selectedConversation ? (
              <CustomerContext conversation={selectedConversation} onUpdate={handleUpdate} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <p>Customer details will appear here</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
