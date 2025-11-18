import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SLACountdownProps {
  slaDueAt: string | null;
  className?: string;
}

export const SLACountdown = ({ slaDueAt, className }: SLACountdownProps) => {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [isBreached, setIsBreached] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!slaDueAt) return;

    const updateCountdown = () => {
      const now = new Date();
      const dueDate = new Date(slaDueAt);
      const minutesRemaining = (dueDate.getTime() - now.getTime()) / 1000 / 60;

      setIsBreached(minutesRemaining <= 0);
      setIsUrgent(minutesRemaining > 0 && minutesRemaining <= 15);
      
      if (minutesRemaining <= 0) {
        setTimeRemaining('BREACHED');
      } else if (minutesRemaining <= 60) {
        setTimeRemaining(`${Math.floor(minutesRemaining)}m remaining`);
      } else {
        setTimeRemaining(formatDistanceToNow(dueDate, { addSuffix: true }));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [slaDueAt]);

  if (!slaDueAt) return null;

  return (
    <div className={cn(
      'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md',
      isBreached && 'bg-destructive text-destructive-foreground animate-pulse',
      isUrgent && !isBreached && 'bg-warning text-warning-foreground',
      !isBreached && !isUrgent && 'bg-success/10 text-success',
      className
    )}>
      <Clock className="h-3 w-3" />
      {timeRemaining}
    </div>
  );
};
