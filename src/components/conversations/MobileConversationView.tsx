import { Conversation, Message } from '@/lib/types';
import { MessageTimeline } from './MessageTimeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SLABadge } from '@/components/sla/SLABadge';
import { Sparkles, User, Clock, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MobileConversationViewProps {
  conversation: Conversation;
  messages: Message[];
  onUpdate: () => void;
  onBack: () => void;
}

const getSentimentEmoji = (sentiment: string | null) => {
  if (!sentiment) return '😐';
  switch (sentiment.toLowerCase()) {
    case 'positive': return '😊';
    case 'negative': return '😟';
    case 'neutral': return '😐';
    default: return '😐';
  }
};

export const MobileConversationView = ({ 
  conversation, 
  messages, 
  onUpdate, 
  onBack 
}: MobileConversationViewProps) => {
  const handleStatusChange = async (newStatus: string) => {
    const { error } = await supabase
      .from('conversations')
      .update({ status: newStatus })
      .eq('id', conversation.id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success('Status updated');
      onUpdate();
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    const { error } = await supabase
      .from('conversations')
      .update({ priority: newPriority })
      .eq('id', conversation.id);

    if (error) {
      toast.error('Failed to update priority');
    } else {
      toast.success('Priority updated');
      onUpdate();
    }
  };

  const handleResolve = async () => {
    const { error } = await supabase
      .from('conversations')
      .update({ 
        status: 'resolved',
        resolved_at: new Date().toISOString()
      })
      .eq('id', conversation.id);

    if (error) {
      toast.error('Failed to resolve conversation');
    } else {
      toast.success('Conversation resolved');
      onUpdate();
    }
  };

  const handleAssignToMe = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('conversations')
      .update({ assigned_to: user.id })
      .eq('id', conversation.id);

    if (error) {
      toast.error('Failed to assign');
    } else {
      toast.success('Assigned to you');
      onUpdate();
    }
  };

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* iOS-native Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            className="h-9 w-9 rounded-full hover:bg-muted/50"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-lg truncate text-foreground">{conversation.title}</h1>
          </div>
          <SLABadge conversation={conversation} />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Hero Status Card */}
        <Card className="rounded-3xl shadow-lg border-0 bg-card overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="rounded-full text-xs font-medium">
                    {conversation.channel}
                  </Badge>
                  <Badge 
                    variant={conversation.priority === 'high' ? 'destructive' : 'secondary'}
                    className="rounded-full text-xs font-medium"
                  >
                    {conversation.priority}
                  </Badge>
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-1">
                  {conversation.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {conversation.created_at && formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Select value={conversation.status || 'open'} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-11 rounded-2xl border-2 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>

              <Select value={conversation.priority || 'medium'} onValueChange={handlePriorityChange}>
                <SelectTrigger className="h-11 rounded-2xl border-2 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!conversation.assigned_to && (
                <Button 
                  variant="outline"
                  onClick={handleAssignToMe}
                  className="flex-1 h-11 rounded-2xl font-medium border-2"
                >
                  <User className="h-4 w-4 mr-2" />
                  Assign to Me
                </Button>
              )}
              {conversation.status !== 'resolved' && (
                <Button 
                  onClick={handleResolve}
                  className="flex-1 h-11 rounded-2xl font-medium"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Resolve
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Insights Card */}
        {conversation.ai_reason_for_escalation && (
          <Card className="rounded-3xl shadow-lg border-0 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg font-semibold">AI Insights</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {Math.round((conversation.ai_confidence || 0) * 100)}% confidence
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Why Escalated
                </h3>
                <p className="text-base text-foreground leading-relaxed">
                  {conversation.ai_reason_for_escalation}
                </p>
              </div>
              
              {conversation.summary_for_human && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Summary
                  </h3>
                  <p className="text-base text-foreground leading-relaxed">
                    {conversation.summary_for_human}
                  </p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap pt-2">
                <Badge variant="secondary" className="rounded-full text-sm font-medium px-3 py-1">
                  {getSentimentEmoji(conversation.ai_sentiment)} {conversation.ai_sentiment}
                </Badge>
                {conversation.category && (
                  <Badge variant="outline" className="rounded-full text-sm font-medium px-3 py-1">
                    {conversation.category}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Customer Info Card */}
        {conversation.customer_id && (
          <Card className="rounded-3xl shadow-lg border-0 bg-card">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-foreground" />
                </div>
                <CardTitle className="text-lg font-semibold">Customer Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Channel</span>
                <Badge variant="outline" className="rounded-full text-sm font-medium">
                  {conversation.channel}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Created</span>
                <span className="text-sm font-medium">
                  {conversation.created_at && formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true })}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4 px-1">Conversation</h2>
          <div className="space-y-3">
            <MessageTimeline messages={messages} />
          </div>
        </div>
        
        {/* Bottom spacing for safe area */}
        <div className="h-24" />
      </div>
    </div>
  );
};
