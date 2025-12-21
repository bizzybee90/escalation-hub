import { useState } from 'react';
import { PowerModeLayout } from '@/components/layout/PowerModeLayout';
import { TabletLayout } from '@/components/layout/TabletLayout';
import { MobileSidebarSheet } from '@/components/sidebar/MobileSidebarSheet';
import { MobileHeader } from '@/components/sidebar/MobileHeader';
import { MobileQuickActions } from '@/components/conversations/MobileQuickActions';
import { MobileConversationList } from '@/components/conversations/mobile/MobileConversationList';
import { MobileConversationView } from '@/components/conversations/mobile/MobileConversationView';
import { Conversation } from '@/lib/types';
import { useSLANotifications } from '@/hooks/useSLANotifications';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsTablet } from '@/hooks/use-tablet';

interface EscalationHubProps {
  filter?: 'my-tickets' | 'unassigned' | 'sla-risk' | 'all-open' | 'awaiting-reply' | 'completed' | 'sent' | 'high-priority' | 'vip-customers' | 'triaged' | 'needs-me' | 'snoozed' | 'cleared' | 'fyi';
}

export const EscalationHub = ({ filter = 'all-open' }: EscalationHubProps) => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>(() => {
    return localStorage.getItem('conversation-sort') || 'sla_urgent';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  useSLANotifications();

  const handleUpdate = async () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleClose = () => {
    setSelectedConversation(null);
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
  };

  const getFilterTitle = () => {
    switch (filter) {
      case 'needs-me': return 'To Reply';
      case 'fyi': return 'FYI';
      case 'cleared': return 'Done';
      case 'snoozed': return 'Snoozed';
      case 'sent': return 'Sent';
      case 'my-tickets': return 'My Tickets';
      case 'unassigned': return 'Unassigned';
      case 'sla-risk': return 'SLA Risk';
      case 'all-open': return 'Inbox (All)';
      case 'awaiting-reply': return 'Awaiting Reply';
      case 'completed': return 'Completed';
      case 'high-priority': return 'High Priority';
      case 'vip-customers': return 'VIP Customers';
      default: return 'Conversations';
    }
  };

  // Tablet view (768px-1024px)
  if (isTablet) {
    return <TabletLayout filter={filter} />;
  }

  // Mobile view
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <MobileHeader
          onMenuClick={() => setSidebarOpen(true)}
          showBackButton={!!selectedConversation}
          onBackClick={handleClose}
        />
        <MobileSidebarSheet
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          onNavigate={handleClose}
        />
        <div className="flex-1 overflow-y-auto">
          {!selectedConversation ? (
            <MobileConversationList
              conversations={conversations}
              onSelect={handleSelectConversation}
              filterTitle={getFilterTitle()}
              statusFilter={statusFilter}
              priorityFilter={priorityFilter}
              channelFilter={channelFilter}
              categoryFilter={categoryFilter}
              sortBy={sortBy}
              onStatusFilterChange={setStatusFilter}
              onPriorityFilterChange={setPriorityFilter}
              onChannelFilterChange={setChannelFilter}
              onCategoryFilterChange={setCategoryFilter}
              onSortByChange={setSortBy}
              onRefresh={handleUpdate}
            />
          ) : (
            <>
              <MobileConversationView
                conversation={selectedConversation}
                messages={[]}
                onUpdate={handleUpdate}
                onBack={handleClose}
              />
              <MobileQuickActions 
                conversation={selectedConversation}
                onUpdate={handleUpdate}
                onClose={handleClose}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  // Desktop view - Single unified layout with collapsible panel
  return <PowerModeLayout filter={filter} />;
};
