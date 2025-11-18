import { useInterfaceMode } from '@/hooks/useInterfaceMode';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Zap, Columns } from 'lucide-react';

export const InterfaceModeToggle = () => {
  const { interfaceMode, setInterfaceMode, loading } = useInterfaceMode();

  if (loading) return null;

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Interface Mode</h3>
      <RadioGroup
        value={interfaceMode}
        onValueChange={(value) => setInterfaceMode(value as 'focus' | 'power')}
      >
        <div className="flex items-start space-x-3 mb-3">
          <RadioGroupItem value="focus" id="focus" />
          <div className="grid gap-1.5 leading-none">
            <Label
              htmlFor="focus"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              Focus Mode
            </Label>
            <p className="text-sm text-muted-foreground">
              Distraction-free, one conversation at a time (popup)
            </p>
          </div>
        </div>
        
        <div className="flex items-start space-x-3">
          <RadioGroupItem value="power" id="power" />
          <div className="grid gap-1.5 leading-none">
            <Label
              htmlFor="power"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
            >
              <Columns className="h-4 w-4" />
              Power Mode
            </Label>
            <p className="text-sm text-muted-foreground">
              See everything, multitask across tickets (3-column)
            </p>
          </div>
        </div>
      </RadioGroup>
    </Card>
  );
};
