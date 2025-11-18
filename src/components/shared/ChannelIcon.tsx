import { MessageSquare, Mail, Phone, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelIconProps {
  channel: string;
  className?: string;
}

export const ChannelIcon = ({ channel, className }: ChannelIconProps) => {
  const getChannelConfig = () => {
    switch (channel?.toLowerCase()) {
      case 'sms':
        return { Icon: MessageSquare, color: 'text-channel-sms', label: 'SMS' };
      case 'whatsapp':
        return { Icon: MessageCircle, color: 'text-channel-whatsapp', label: 'WhatsApp' };
      case 'email':
        return { Icon: Mail, color: 'text-channel-email', label: 'Email' };
      case 'phone':
        return { Icon: Phone, color: 'text-channel-phone', label: 'Phone' };
      case 'webchat':
        return { Icon: MessageCircle, color: 'text-channel-webchat', label: 'Chat' };
      default:
        return { Icon: MessageSquare, color: 'text-muted-foreground', label: channel };
    }
  };

  const { Icon, color } = getChannelConfig();

  return (
    <Icon className={cn('h-3 w-3', color, className)} />
  );
};
