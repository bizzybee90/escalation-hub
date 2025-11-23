import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, CheckCircle2, AlertCircle, Sparkles, Crown, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Conversation, Message } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChannelIcon } from '@/components/shared/ChannelIcon';
import { MessageTimeline } from '@/components/conversations/MessageTimeline';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SnoozeDialog } from '@/components/conversations/SnoozeDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface MobileConversationViewProps {
  conversation: Conversation;
  messages: Message[];
  onBack: () => void;
  onUpdate: () => void;
}

const getSentimentEmoji = (sentiment: string | null) => {
  switch (sentiment?.toLowerCase()) {
    case 'positive': return '😊';
    case 'negative': return '😔';
    case 'neutral': return '😐';
    case 'frustrated': return '😤';
    case 'urgent': return '🚨';
    default: return '💬';
  }
};

export const MobileConversationView = ({
  conversation,
  messages,
  onBack,
  onUpdate,
}: MobileConversationViewProps) => {
  const [replyText, setReplyText] = useState(() => {
    const saved = localStorage.getItem(`draft-${conversation.id}`);
    return saved || '';
  });
  const [isInternal, setIsInternal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [aiInsightsExpanded, setAiInsightsExpanded] = useState(false);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const { toast } = useToast();

  // Hide bottom nav when this view is mounted
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mobile-nav-visibility', { 
      detail: { hidden: true } 
    }));
    
    return () => {
      // Show bottom nav when unmounting (going back to list)
      window.dispatchEvent(new CustomEvent('mobile-nav-visibility', { 
        detail: { hidden: false } 
      }));
    };
  }, []);

  const handleResolve = async () => {
    const { error } = await supabase
      .from('conversations')
      .update({ 
        status: 'resolved',
        resolved_at: new Date().toISOString()
      })
      .eq('id', conversation.id);

    if (!error) {
      toast({ 
        title: "✨ Conversation Resolved",
        description: "Great work! Moving on to the next one."
      });
      onBack();
      onUpdate();
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;

    setIsSending(true);
    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        body: replyText,
        actor_type: 'agent',
        direction: isInternal ? 'internal' : 'outbound',
        channel: conversation.channel,
        is_internal: isInternal,
      });

    if (!error) {
      localStorage.removeItem(`draft-${conversation.id}`);
      setReplyText('');
      toast({ 
        title: isInternal ? "Internal note added" : "Reply sent",
        description: isInternal ? "Your note has been saved" : "Your message is on its way"
      });
      onUpdate();
    }
    setIsSending(false);
  };

  const isOverdue = conversation.sla_due_at && new Date(conversation.sla_due_at) < new Date();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* iOS-Style Header */}
      <div className="flex-shrink-0 bg-background/95 backdrop-blur-lg border-b border-border/40 sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 py-3.5">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 -ml-2 p-2 rounded-lg active:bg-muted/50 active:scale-95 transition-all"
          >
            <ArrowLeft className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">Back</span>
          </button>
          <div className="flex-1 min-w-0 mx-3 text-center">
            <h2 className="text-base font-semibold text-foreground line-clamp-2 leading-tight">
              {conversation.title || 'Conversation'}
            </h2>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 -mr-2">
                <MoreVertical className="h-5 w-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSnoozeDialogOpen(true)}>
                Snooze
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleResolve}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Resolve
              </DropdownMenuItem>
              {conversation.customer_id && (
                <DropdownMenuItem>
                  View Customer Details
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pb-44">
          {/* AI Insights Card - Collapsible, iOS-style */}
          {conversation.ai_reason_for_escalation && (
            <Card className="mt-3 mb-4 rounded-2xl p-0 bg-background border-border/40 shadow-sm overflow-hidden">
              <button
                onClick={() => setAiInsightsExpanded(!aiInsightsExpanded)}
                className="w-full p-4 flex items-start gap-3 active:bg-muted/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
                    {conversation.ai_confidence && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(conversation.ai_confidence * 100)}% confident
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                    {conversation.ai_sentiment && `${getSentimentEmoji(conversation.ai_sentiment)} `}
                    {conversation.summary_for_human || conversation.ai_reason_for_escalation}
                  </p>
                </div>
                <ArrowLeft className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${aiInsightsExpanded ? '-rotate-90' : 'rotate-180'}`} />
              </button>

              {aiInsightsExpanded && (
                <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border/40 mt-0">
                  {/* Why Escalated */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 mt-3">
                      Why Escalated
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {conversation.ai_reason_for_escalation}
                    </p>
                  </div>

                  {/* AI Draft */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      AI Draft
                    </p>
                    <div className="rounded-xl bg-muted/30 p-3">
                      <p className="text-sm text-foreground leading-relaxed">
                        Hi there! I completely understand your frustration and I'm here to help. I've looked into this issue and we can get this resolved for you within the next 24 hours. Would you like me to walk you through the solution steps now, or would you prefer we handle it on our end?
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReplyText("Hi there! I completely understand your frustration and I'm here to help. I've looked into this issue and we can get this resolved for you within the next 24 hours. Would you like me to walk you through the solution steps now, or would you prefer we handle it on our end?");
                        toast({ title: "Draft copied to reply" });
                        setAiInsightsExpanded(false);
                      }}
                      className="mt-2 w-full text-xs h-8"
                    >
                      Use this draft
                    </Button>
                  </div>

                  {/* Tags */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {conversation.ai_sentiment && (
                      <Badge variant="outline" className="rounded-full text-[10px] h-6 px-2.5">
                        {conversation.ai_sentiment}
                      </Badge>
                    )}
                    {conversation.category && (
                      <Badge variant="outline" className="rounded-full text-[10px] h-6 px-2.5 capitalize">
                        {conversation.category}
                      </Badge>
                    )}
                    {conversation.priority && (
                      <Badge
                        variant={
                          conversation.priority === 'high'
                            ? 'destructive'
                            : conversation.priority === 'medium'
                            ? 'secondary'
                            : 'outline'
                        }
                        className="rounded-full text-[10px] h-6 px-2.5 uppercase"
                      >
                        {conversation.priority}
                      </Badge>
                    )}
                    {isOverdue && (
                      <Badge variant="destructive" className="rounded-full text-[10px] h-6 px-2.5">
                        Overdue
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Conversation Timeline */}
          <div className="space-y-2">
            <MessageTimeline messages={messages} />
          </div>
        </div>
      </div>

      {/* iOS-Style Composer - Only sticky element at bottom */}
      <div className="flex-shrink-0 bg-background rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.04)] border-t border-border/30 pb-safe">
        <div className="px-4 py-3 space-y-3">
          {/* Reply Type Toggle - iOS segmented control style */}
          <div className="flex gap-1 p-1 bg-muted/40 rounded-full w-fit">
            <button
              onClick={() => setIsInternal(false)}
              className={`px-4 h-7 rounded-full text-xs font-medium transition-all ${
                !isInternal
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              Reply
            </button>
            <button
              onClick={() => setIsInternal(true)}
              className={`px-4 h-7 rounded-full text-xs font-medium transition-all ${
                isInternal
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              Note
            </button>
          </div>

          {/* Message Input - iOS-style with inline send button */}
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Textarea
                value={replyText}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setReplyText(newValue);
                  if (newValue) {
                    localStorage.setItem(`draft-${conversation.id}`, newValue);
                  } else {
                    localStorage.removeItem(`draft-${conversation.id}`);
                  }
                }}
                placeholder={isInternal ? "Add a note…" : "Type your reply…"}
                className="w-full min-h-[44px] max-h-32 rounded-3xl resize-none text-base px-4 py-3 pr-12 border-border/50 bg-background focus:border-primary/50 transition-colors"
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || isSending}
                className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:bg-muted transition-all active:scale-95"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Snooze Dialog */}
      <SnoozeDialog
        conversationId={conversation.id}
        open={snoozeDialogOpen}
        onOpenChange={setSnoozeDialogOpen}
        onSuccess={onUpdate}
      />
    </div>
  );
};
