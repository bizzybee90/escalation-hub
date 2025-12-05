import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { MessageSquare, Phone, Mail, Globe, Plus } from 'lucide-react';
import { GmailAccountCard } from './GmailAccountCard';

interface Channel {
  id: string;
  channel: string;
  enabled: boolean;
}

interface GmailConfig {
  id: string;
  email_address: string;
  import_mode: string;
  last_sync_at: string | null;
  connected_at: string;
  workspace_id: string;
}

export const ChannelManagementPanel = () => {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [gmailConfigs, setGmailConfigs] = useState<GmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const channelIcons: Record<string, any> = {
    sms: Phone,
    whatsapp: MessageSquare,
    email: Mail,
    webchat: Globe
  };

  const channelLabels: Record<string, string> = {
    sms: 'SMS',
    whatsapp: 'WhatsApp',
    email: 'Email',
    webchat: 'Web Chat'
  };

  useEffect(() => {
    fetchChannels();
    fetchGmailConfigs();
  }, [workspace?.id]);

  const fetchChannels = async () => {
    if (!workspace?.id) return;

    try {
      const { data, error } = await supabase
        .from('workspace_channels')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('channel');

      if (error) throw error;
      setChannels(data || []);
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGmailConfigs = async () => {
    if (!workspace?.id) return;

    try {
      const { data, error } = await supabase
        .from('gmail_channel_configs')
        .select('*')
        .eq('workspace_id', workspace.id);

      if (error) throw error;
      setGmailConfigs(data || []);
    } catch (error) {
      console.error('Error fetching Gmail configs:', error);
    }
  };

  const handleConnectGmail = async () => {
    if (!workspace?.id) return;
    
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-oauth-start', {
        body: { workspaceId: workspace.id },
      });

      if (error) throw error;
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error starting Gmail OAuth:', error);
      toast({ title: 'Failed to connect Gmail', variant: 'destructive' });
      setConnecting(false);
    }
  };

  const toggleChannel = async (channelId: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('workspace_channels')
        .update({ enabled: !currentState })
        .eq('id', channelId);

      if (error) throw error;

      setChannels(channels.map(c => 
        c.id === channelId ? { ...c, enabled: !currentState } : c
      ));

      toast({
        title: 'Channel updated',
        description: `Channel ${!currentState ? 'enabled' : 'disabled'} successfully`
      });
    } catch (error) {
      console.error('Error toggling channel:', error);
      toast({ title: 'Error', description: 'Failed to update channel', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-6">Loading channels...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Gmail Integration Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Integration
          </h3>
          <p className="text-sm text-muted-foreground">
            Connect your Gmail account to receive and send emails directly
          </p>
        </div>

        {gmailConfigs.length > 0 ? (
          <div className="space-y-3">
            {gmailConfigs.map(config => (
              <GmailAccountCard
                key={config.id}
                config={config}
                onDisconnect={fetchGmailConfigs}
                onUpdate={fetchGmailConfigs}
              />
            ))}
          </div>
        ) : (
          <Card className="p-6 border-dashed">
            <div className="text-center space-y-3">
              <Mail className="h-10 w-10 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">No Gmail account connected</p>
                <p className="text-sm text-muted-foreground">
                  Connect your Gmail to handle email conversations
                </p>
              </div>
              <Button onClick={handleConnectGmail} disabled={connecting}>
                <Plus className="h-4 w-4 mr-2" />
                {connecting ? 'Connecting...' : 'Connect Gmail Account'}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Other Channels Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Other Channels</h3>
          <p className="text-sm text-muted-foreground">
            Enable or disable communication channels for your workspace
          </p>
        </div>

        <div className="space-y-3">
          {channels.filter(c => c.channel !== 'email').map((channel) => {
            const Icon = channelIcons[channel.channel];
            return (
              <Card key={channel.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${channel.enabled ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{channelLabels[channel.channel]}</span>
                        {channel.enabled && <Badge variant="secondary" className="text-xs">Active</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {channel.channel === 'sms' && 'Text message communication'}
                        {channel.channel === 'whatsapp' && 'WhatsApp Business messaging'}
                        {channel.channel === 'webchat' && 'Website chat widget (coming soon)'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={channel.enabled}
                    onCheckedChange={() => toggleChannel(channel.id, channel.enabled)}
                    disabled={channel.channel === 'webchat'}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
