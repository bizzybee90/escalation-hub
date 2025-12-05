import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mail, RefreshCw, Trash2, Clock, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface GmailConfig {
  id: string;
  email_address: string;
  import_mode: string;
  last_sync_at: string | null;
  connected_at: string;
  workspace_id: string;
}

interface GmailAccountCardProps {
  config: GmailConfig;
  onDisconnect: () => void;
  onUpdate: () => void;
}

export function GmailAccountCard({ config, onDisconnect, onUpdate }: GmailAccountCardProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [importMode, setImportMode] = useState(config.import_mode);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-sync', {
        body: { workspaceId: config.workspace_id, mode: importMode },
      });

      if (error) throw error;

      toast({
        title: 'Sync complete',
        description: `Processed ${data.messagesProcessed || 0} messages`,
      });
      onUpdate();
    } catch (error) {
      console.error('Sync error:', error);
      toast({ title: 'Sync failed', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this Gmail account?')) return;

    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('gmail-disconnect', {
        body: { workspaceId: config.workspace_id, emailAddress: config.email_address },
      });

      if (error) throw error;

      toast({ title: 'Gmail disconnected' });
      onDisconnect();
    } catch (error) {
      console.error('Disconnect error:', error);
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleImportModeChange = async (mode: string) => {
    setImportMode(mode);
    try {
      await supabase
        .from('gmail_channel_configs')
        .update({ import_mode: mode })
        .eq('id', config.id);
      
      toast({ title: 'Import mode updated' });
    } catch (error) {
      console.error('Error updating import mode:', error);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-medium">{config.email_address}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                  Connected
                </Badge>
                {config.last_sync_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Synced {formatDistanceToNow(new Date(config.last_sync_at), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={importMode} onValueChange={handleImportModeChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_only">New Messages Only</SelectItem>
                <SelectItem value="unread_only">Unread Messages</SelectItem>
                <SelectItem value="all_historical_90_days">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
