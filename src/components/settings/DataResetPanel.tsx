import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface DataResetPanelProps {
  workspaceId: string;
}

export function DataResetPanel({ workspaceId }: DataResetPanelProps) {
  const navigate = useNavigate();
  const [isResetting, setIsResetting] = useState(false);
  const [includeCustomers, setIncludeCustomers] = useState(false);
  const [includeSenderRules, setIncludeSenderRules] = useState(true);
  const [includeBusinessContext, setIncludeBusinessContext] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      // Get conversation IDs first for message deletion
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('workspace_id', workspaceId);
      
      const conversationIds = conversations?.map(c => c.id) || [];

      // 1. Delete messages first (depends on conversations)
      if (conversationIds.length > 0) {
        const { error: messagesError } = await supabase
          .from('messages')
          .delete()
          .in('conversation_id', conversationIds);
        if (messagesError) console.error('Error deleting messages:', messagesError);
      }

      // 2. Delete conversations
      const { error: convoError } = await supabase
        .from('conversations')
        .delete()
        .eq('workspace_id', workspaceId);
      if (convoError) console.error('Error deleting conversations:', convoError);

      // 3. Delete triage corrections
      const { error: triageError } = await supabase
        .from('triage_corrections')
        .delete()
        .eq('workspace_id', workspaceId);
      if (triageError) console.error('Error deleting triage corrections:', triageError);

      // 4. Delete sender behaviour stats
      const { error: statsError } = await supabase
        .from('sender_behaviour_stats')
        .delete()
        .eq('workspace_id', workspaceId);
      if (statsError) console.error('Error deleting sender stats:', statsError);

      // 5. Optionally delete sender rules
      if (includeSenderRules) {
        const { error: rulesError } = await supabase
          .from('sender_rules')
          .delete()
          .eq('workspace_id', workspaceId);
        if (rulesError) console.error('Error deleting sender rules:', rulesError);
      }

      // 6. Optionally delete customers
      if (includeCustomers) {
        const { error: customersError } = await supabase
          .from('customers')
          .delete()
          .eq('workspace_id', workspaceId);
        if (customersError) console.error('Error deleting customers:', customersError);
      }

      // 7. Optionally reset business context
      if (includeBusinessContext) {
        const { error: contextError } = await supabase
          .from('business_context')
          .delete()
          .eq('workspace_id', workspaceId);
        if (contextError) console.error('Error deleting business context:', contextError);
      }

      toast.success('Data reset complete');
    } catch (error) {
      console.error('Error resetting data:', error);
      toast.error('Failed to reset data');
    } finally {
      setIsResetting(false);
    }
  };

  const handleReOnboard = async () => {
    setIsResetting(true);
    try {
      // Reset all data
      await handleReset();

      // Reset user onboarding status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('users')
          .update({ 
            onboarding_completed: false,
            onboarding_step: 'welcome'
          })
          .eq('id', user.id);
      }

      toast.success('Redirecting to onboarding...');
      navigate('/onboarding');
    } catch (error) {
      console.error('Error re-onboarding:', error);
      toast.error('Failed to start re-onboarding');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Data Management
        </CardTitle>
        <CardDescription>
          Reset your workspace data or re-run the onboarding process
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Options */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">What to include in reset:</Label>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="sender-rules" 
                checked={includeSenderRules}
                onCheckedChange={(checked) => setIncludeSenderRules(checked as boolean)}
              />
              <Label htmlFor="sender-rules" className="text-sm cursor-pointer">
                Sender rules & AI learning data
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox 
                id="customers" 
                checked={includeCustomers}
                onCheckedChange={(checked) => setIncludeCustomers(checked as boolean)}
              />
              <Label htmlFor="customers" className="text-sm cursor-pointer">
                Customer records
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox 
                id="business-context" 
                checked={includeBusinessContext}
                onCheckedChange={(checked) => setIncludeBusinessContext(checked as boolean)}
              />
              <Label htmlFor="business-context" className="text-sm cursor-pointer">
                Business context settings
              </Label>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Conversations and messages are always deleted. Email connections are preserved.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                disabled={isResetting}
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Reset Data Only
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset workspace data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all selected data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleReset}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Reset Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                className="w-full"
                disabled={isResetting}
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Reset & Re-Onboard
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset and start fresh?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all selected data and restart the onboarding wizard. 
                  Your email connection will be preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleReOnboard}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Reset & Re-Onboard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
