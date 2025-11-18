import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Clock } from 'lucide-react';

interface SnoozeDialogProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const SnoozeDialog = ({ conversationId, open, onOpenChange, onSuccess }: SnoozeDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const snoozeOptions = [
    { label: '1 hour', hours: 1 },
    { label: '4 hours', hours: 4 },
    { label: '1 day', hours: 24 },
    { label: '3 days', hours: 72 },
    { label: '1 week', hours: 168 },
  ];

  const handleSnooze = async (hours: number) => {
    setLoading(true);
    const snoozeUntil = new Date();
    snoozeUntil.setHours(snoozeUntil.getHours() + hours);

    const { error } = await supabase
      .from('conversations')
      .update({ snoozed_until: snoozeUntil.toISOString() })
      .eq('id', conversationId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to snooze conversation",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Conversation snoozed",
        description: `This conversation will return in ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
      });
      onOpenChange(false);
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Snooze Conversation
          </DialogTitle>
          <DialogDescription>
            Hide this conversation from your queue until the selected time
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-2">
          {snoozeOptions.map((option) => (
            <Button
              key={option.hours}
              variant="outline"
              onClick={() => handleSnooze(option.hours)}
              disabled={loading}
              className="justify-start"
            >
              {option.label}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
