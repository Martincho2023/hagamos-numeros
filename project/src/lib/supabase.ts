import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Juntada = {
  id: string;
  nombre: string;
  mode: 'bar' | 'casa';
  total: number;
  tip_percentage: number;
  extra_expenses_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Participant = {
  id: string;
  juntada_id: string;
  name: string;
  alias_bancario: string;
  pago_efectivo: boolean;
  is_recaudador: boolean;
  amount_spent: number;
  extra_amount: number;
  created_at: string;
  device_id?: string | null;
};

export type JuntadaWithParticipants = Juntada & {
  participants: Participant[];
};
