import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './Sidebar';
import beeLogo from '@/assets/bee-logo.png';

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
        <button 
          className="fixed top-4 left-4 z-[9999] p-2 group"
          aria-label="Open menu"
        >
          <div className="relative">
            <img 
              src={beeLogo} 
              alt="Menu" 
              className="h-10 w-10 transition-all duration-300 group-hover:scale-110 group-active:scale-95 drop-shadow-md" 
            />
            {/* Subtle pulse ring to indicate interactivity */}
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-md" />
          </div>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <Sidebar onNavigate={handleNavigate} />
      </SheetContent>
    </Sheet>
  );
};
