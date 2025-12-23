import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowUp, Tag } from 'lucide-react';
import { Conversation } from '@/lib/types';
import { TriageCorrectionFlow } from './TriageCorrectionFlow';

interface TriageQuickActionsProps {
  conversation: Conversation;
  onUpdate?: () => void;
}

export function TriageQuickActions({ conversation, onUpdate }: TriageQuickActionsProps) {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const currentClassification = conversation.email_classification || '';

  const handleMoveToActionRequired = async () => {
    setIsUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: userData } = await supabase
        .from('users')
        .select('workspace_id')
        .eq('id', user?.id)
        .single();

      // Log the correction for learning
      const { error: correctionError } = await supabase
        .from('triage_corrections')
        .insert({
          workspace_id: userData?.workspace_id,
          conversation_id: conversation.id,
          original_classification: currentClassification,
          new_classification: 'customer_inquiry',
          original_requires_reply: false,
          new_requires_reply: true,
          sender_email: conversation.customer?.email || null,
          sender_domain: conversation.customer?.email?.split('@')[1] || null,
          corrected_by: user?.id,
        });

      if (correctionError) {
        console.error('Failed to log correction:', correctionError);
      }

      // Update the conversation
      const { error } = await supabase
        .from('conversations')
        .update({
          requires_reply: true,
          email_classification: 'customer_inquiry',
          status: 'open',
          resolved_at: null,
          decision_bucket: 'quick_win',
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({ title: 'Moved to Action Required' });
      onUpdate?.();
    } catch (error) {
      console.error('Error moving conversation:', error);
      toast({ 
        title: 'Failed to move', 
        description: 'Please try again',
        variant: 'destructive' 
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
        <Button
          variant="outline"
          size="sm"
          onClick={handleMoveToActionRequired}
          disabled={isUpdating}
          className="flex items-center gap-1.5 text-xs"
        >
          <ArrowUp className="h-3 w-3" />
          Action Required
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCorrectionOpen(true)}
          className="flex items-center gap-1.5 text-xs"
        >
          <Tag className="h-3 w-3" />
          Correct Classification
        </Button>
      </div>

      <TriageCorrectionFlow
        conversation={conversation}
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        onUpdate={onUpdate}
      />
    </>
  );
}
