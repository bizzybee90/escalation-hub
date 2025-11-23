import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './Sidebar';

interface MobileSidebarSheetProps {
  onNavigate?: () => void;
}

export const MobileSidebarSheet = ({ onNavigate }: MobileSidebarSheetProps) => {
  const [open, setOpen] = useState(false);

  const handleNavigate = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="icon"
          className="fixed top-4 left-4 z-[9999] h-12 w-12 rounded-full bg-background shadow-xl border-2"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <Sidebar onNavigate={handleNavigate} />
      </SheetContent>
    </Sheet>
  );
};
