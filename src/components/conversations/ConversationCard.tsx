import { Conversation } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { Clock } from 'lucide-react';
import { ChannelIcon } from '../shared/ChannelIcon';
import { cn } from '@/lib/utils';

interface ConversationCardProps {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}

export const ConversationCard = ({ conversation, selected, onClick }: ConversationCardProps) => {
  const getPriorityLabel = (priority: string | null) => {
    if (!priority) return null;
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "p-4 md:p-5 cursor-pointer transition-all duration-200 rounded-[20px] mb-3",
        "bg-background border border-border/50 hover:border-primary/20",
        "hover:shadow-md hover:shadow-primary/5 active:scale-[0.98]",
        selected && "border-primary/40 shadow-lg shadow-primary/10 bg-gradient-to-br from-primary/5 to-background"
      )}
    >
      {/* Mobile & Desktop unified layout */}
      <div className="flex flex-col gap-3">
        {/* Top row: Channel, Title */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 pt-0.5">
            <ChannelIcon channel={conversation.channel} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-snug mb-1" title={conversation.title || 'Untitled Conversation'}>
              {conversation.title || 'Untitled Conversation'}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed" title={conversation.summary_for_human || 'No summary available'}>
              {conversation.summary_for_human || 'No summary available'}
            </p>
          </div>
        </div>
        
        {/* Bottom row: Badges and Time */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {conversation.priority && (
              <Badge 
                variant={conversation.priority === 'high' ? 'destructive' : 'secondary'}
                className="rounded-full px-3 py-0.5 text-xs font-medium"
              >
                {getPriorityLabel(conversation.priority)}
              </Badge>
            )}
            {conversation.category && (
              <Badge 
                variant="outline"
                className="rounded-full px-3 py-0.5 text-xs"
              >
                {conversation.category}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatDistanceToNow(new Date(conversation.created_at!), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
