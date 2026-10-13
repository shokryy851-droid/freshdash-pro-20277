import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Targeted realtime: RLS decides which rows each user receives.
 * On change we invalidate only the affected query keys — no full-state reload.
 */
export function useRealtimeInvalidation(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`fdp-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void qc.invalidateQueries({ queryKey: ['orders'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}
