import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

type InterfaceMode = 'focus' | 'power';

export const useInterfaceMode = () => {
  const [interfaceMode, setInterfaceModeState] = useState<InterfaceMode>('focus');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMode = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('users')
        .select('interface_mode')
        .eq('id', user.id)
        .single();

      if (data?.interface_mode) {
        setInterfaceModeState(data.interface_mode as InterfaceMode);
      }
      setLoading(false);
    };

    fetchMode();
  }, []);

  const setInterfaceMode = async (mode: InterfaceMode) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('users')
      .update({ interface_mode: mode })
      .eq('id', user.id);

    setInterfaceModeState(mode);
  };

  const toggleMode = () => {
    const newMode = interfaceMode === 'focus' ? 'power' : 'focus';
    setInterfaceMode(newMode);
  };

  return { interfaceMode, setInterfaceMode, toggleMode, loading };
};
