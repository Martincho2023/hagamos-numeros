import { useState, useEffect, useRef } from 'react';
import { Beer, Plus, Trash2, Check, Copy, Share2, QrCode, MessageCircle, X } from 'lucide-react';
import { Header } from '../components/Header';
import { supabase, Participant } from '../lib/supabase';
import { formatCurrency, calculateBarMode, CalculationResult } from '../utils/calculations';
import { PullToRefresh } from '../components/PullToRefresh';
import { getDeviceId } from '../utils/deviceId';

function getNativeQrUrl(text: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&ecc=M&margin=0`;
}

interface BarModeScreenProps {
  juntadaId?: string;
  onBack: () => void;
  userName?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

interface InputFocusState {
  [key: string]: boolean;
}

interface ExpandedState {
  [key: number]: {
    alias: boolean;
    gasto: boolean;
  };
}

export function BarModeScreen({
  juntadaId,
  onBack,
  userName,
  darkMode,
  onToggleDarkMode,
}: BarModeScreenProps) {
  const [name, setName] = useState('Bar');
  const [total, setTotal] = useState(0);
  const [tipPercentage, setTipPercentage] = useState(0);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [calculations, setCalculations] = useState<CalculationResult | null>(null);
  const [currentJuntadaId, setCurrentJuntadaId] = useState<string | null>(juntadaId || null);
  const [focusedInputs, setFocusedInputs] = useState<InputFocusState>({});
  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
  const [showQrModal, setShowQrModal] = useState(false);

  // Refs para evitar efectos duplicados
  const initializedRef = useRef(false);
  const invitadoRegistradoRef = useRef(false);
  const creatingJuntadaRef = useRef<Promise<string | null> | null>(null);

  // ─── EFECTO PRINCIPAL: solo se ejecuta una vez al montar ───
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (juntadaId) {
      // Caso: viene de QR o historial → cargar de DB
      loadJuntada(juntadaId);
    } else if (userName) {
      // Caso: juntada nueva → inicializar con el usuario en memoria
      setParticipants([{
        id: '',
        juntada_id: '',
        name: userName,
        alias_bancario: '',
        pago_efectivo: false,
        is_recaudador: true,
        amount_spent: 0,
        extra_amount: 0,
        created_at: '',
      }]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── REGISTRO DE INVITADO: solo cuando entra por QR y ya cargó la juntada ───
  useEffect(() => {
    if (!juntadaId || !currentJuntadaId || !userName || invitadoRegistradoRef.current) return;

    const registrarInvitado = async () => {
      const { data: existing } = await supabase
        .from('participants')
        .select('id')
        .eq('juntada_id', currentJuntadaId)
        .eq('name', userName)
        .maybeSingle();

      if (!existing) {
        await supabase.from('participants').insert({
          juntada_id: currentJuntadaId,
          name: userName,
          is_recaudador: false,
          alias_bancario: '',
          pago_efectivo: false,
          amount_spent: 0,
          extra_amount: 0,
          device_id: getDeviceId(),
        });
        // Recargar participantes sin tocar el resto del estado
        const { data: parts } = await supabase
          .from('participants')
          .select('id, name, alias_bancario, pago_efectivo, is_recaudador, amount_spent, extra_amount, created_at')
          .eq('juntada_id', currentJuntadaId)
          .order('created_at', { ascending: true });
        if (parts) {
          setParticipants(parts.map(p => ({ ...p, pago_efectivo: p.pago_efectivo || false })));
        }
      }
      invitadoRegistradoRef.current = true;
    };

    registrarInvitado();
  }, [currentJuntadaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── RECALCULAR cuando cambian valores clave ───
  useEffect(() => {
    recalculate();
  }, [total, tipPercentage, participants]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── CARGA DE JUNTADA EXISTENTE ───
  const loadJuntada = async (id: string) => {
    try {
      const { data: juntada, error: juntadaError } = await supabase
        .from('juntadas')
        .select('name, mode, total, tip_percentage, extra_expenses_enabled')
        .eq('id', id)
        .maybeSingle();

      if (juntadaError) throw juntadaError;
      if (juntada) {
        setName(juntada.name);
        setTotal(Number(juntada.total));
        setTipPercentage(Number(juntada.tip_percentage));
      }

      const { data: parts, error: partsError } = await supabase
        .from('participants')
        .select('id, name, alias_bancario, pago_efectivo, is_recaudador, amount_spent, extra_amount, created_at')
        .eq('juntada_id', id)
        .order('created_at', { ascending: true });

      if (partsError) throw partsError;
      if (parts) {
        setParticipants(parts.map(p => ({ ...p, pago_efectivo: p.pago_efectivo || false })));
      }

      setCurrentJuntadaId(id);
    } catch (error) {
      console.error('Error loading juntada:', error);
    }
  };

  // ─── GUARDAR / CREAR JUNTADA ───
  const ensureJuntadaExists = async (): Promise<string | null> => {
    if (currentJuntadaId) return currentJuntadaId;

    // Si ya hay una creación en curso, esperamos ese resultado en vez de crear otra
    if (creatingJuntadaRef.current) return creatingJuntadaRef.current;

    const doCreate = async (): Promise<string | null> => {
      // Segunda verificación dentro del lock (por si se seteó mientras esperábamos)
      if (currentJuntadaId) return currentJuntadaId;

      const { data: juntada, error } = await supabase
        .from('juntadas')
        .insert({ name: name || 'Bar', mode: 'bar', total, tip_percentage: tipPercentage })
        .select('id')
        .single();

      if (error || !juntada) {
        console.error('Error creando juntada:', error);
        return null;
      }

      // Guardar participante inicial (el recaudador)
      const recaudador = participants.find(p => p.is_recaudador);
      if (recaudador) {
        const { data: partData } = await supabase
          .from('participants')
          .insert({
            juntada_id: juntada.id,
            name: recaudador.name || userName || 'Yo',
            alias_bancario: recaudador.alias_bancario,
            pago_efectivo: recaudador.pago_efectivo,
            is_recaudador: true,
            amount_spent: 0,
            extra_amount: recaudador.extra_amount,
            device_id: getDeviceId(),
          })
          .select()
          .maybeSingle();

        if (partData) {
          setParticipants(prev =>
            prev.map(p => p.is_recaudador ? { ...p, id: partData.id, juntada_id: juntada.id } : p)
          );
        }
      }

      setCurrentJuntadaId(juntada.id);
      return juntada.id;
    };

    creatingJuntadaRef.current = doCreate().finally(() => {
      creatingJuntadaRef.current = null;
    });
    return creatingJuntadaRef.current;
  };

  const saveJuntada = async () => {
    const id = await ensureJuntadaExists();
    if (!id) return;

    await supabase
      .from('juntadas')
      .update({ name, total, tip_percentage: tipPercentage, extra_expenses_enabled: true })
      .eq('id', id);
  };

  // ─── RECALCULAR ───
  const recalculate = () => {
    if (participants.length === 0) {
      setCalculations(null);
      return;
    }
    const result = calculateBarMode(
      total,
      tipPercentage,
      participants.map(p => ({
        name: p.name,
        extra_amount: Number(p.extra_amount || 0),
        is_recaudador: p.is_recaudador,
        pago_efectivo: p.pago_efectivo || false,
      }))
    );
    setCalculations(result);
  };

  // ─── REALTIME: escuchar cambios en participantes ───
useEffect(() => {
  if (!currentJuntadaId) return;

  const channel = supabase
    .channel(`juntada-${currentJuntadaId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `juntada_id=eq.${currentJuntadaId}`,
      },
      () => {
        // Recargar participantes cuando hay cambios
        supabase
          .from('participants')
          .select('id, name, alias_bancario, pago_efectivo, is_recaudador, amount_spent, extra_amount, created_at')
          .eq('juntada_id', currentJuntadaId)
          .order('created_at', { ascending: true })
          .then(({ data }) => {
            if (data) setParticipants(data.map(p => ({ ...p, pago_efectivo: p.pago_efectivo || false })));
          });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [currentJuntadaId]);

  // ─── PARTICIPANTES ───
  const addParticipant = async () => {
    const id = await ensureJuntadaExists();
    const newParticipant: Participant = {
      id: '',
      juntada_id: id || '',
      name: '',
      alias_bancario: '',
      pago_efectivo: false,
      is_recaudador: participants.length === 0,
      amount_spent: 0,
      extra_amount: 0,
      created_at: '',
    };
    setParticipants([...participants, newParticipant]);
  };

  const updateParticipant = (index: number, updates: Partial<Participant>) => {
    const updated = [...participants];
    updated[index] = { ...updated[index], ...updates };
    setParticipants(updated);
  };

  const setRecaudador = async (index: number) => {
    const updated = participants.map((p, i) => ({
      ...p,
      is_recaudador: i === index,
      alias_bancario: i === index ? p.alias_bancario : '',
    }));
    setParticipants(updated);

    setExpandedRows(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (Number(key) !== index) {
          next[Number(key)] = { ...next[Number(key)], alias: false };
        }
      });
      return next;
    });

    if (currentJuntadaId) {
      const recaudadorId = participants[index]?.id;
      if (recaudadorId) {
        await supabase.from('participants').update({ is_recaudador: false, alias_bancario: '' }).eq('juntada_id', currentJuntadaId);
        await supabase.from('participants').update({ is_recaudador: true, alias_bancario: participants[index].alias_bancario }).eq('id', recaudadorId);
      }
    }
  };

  const removeParticipant = async (index: number) => {
    const participant = participants[index];
    if (participant.id) {
      await supabase.from('participants').delete().eq('id', participant.id);
    }
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const saveParticipant = async (index: number) => {
    const participant = participants[index];
    if (!participant.name) return;

    const id = await ensureJuntadaExists();
    if (!id) return;

    try {
      if (participant.id) {
        await supabase
          .from('participants')
          .update({
            name: participant.name,
            alias_bancario: participant.alias_bancario,
            pago_efectivo: participant.pago_efectivo,
            extra_amount: participant.extra_amount,
          })
          .eq('id', participant.id);
      } else {
        const { data } = await supabase
          .from('participants')
          .insert({
            juntada_id: id,
            name: participant.name,
            alias_bancario: participant.alias_bancario,
            pago_efectivo: participant.pago_efectivo,
            is_recaudador: participant.is_recaudador,
            amount_spent: 0,
            extra_amount: participant.extra_amount,
            device_id: participant.name === userName ? getDeviceId() : null,
          })
          .select()
          .maybeSingle();

        if (data) {
          const updated = [...participants];
          updated[index] = { ...updated[index], id: data.id, juntada_id: id };
          setParticipants(updated);
        }
      }
    } catch (error) {
      console.error('Error saving participant:', error);
    }
  };

  const deleteJuntada = async () => {
    if (!currentJuntadaId) return;
    if (confirm('¿Estás seguro de que querés borrar esta juntada?')) {
      await supabase.from('participants').delete().eq('juntada_id', currentJuntadaId);
      await supabase.from('juntadas').delete().eq('id', currentJuntadaId);
      onBack();
    }
  };

  // ─── COMPARTIR ───
  const getShareUrl = () => `https://hagamos-numeros-dg9k.bolt.host?juntadaId=${currentJuntadaId || ''}`;

  const inviteViaWhatsApp = async () => {
  const id = await ensureJuntadaExists();
  if (!id) return;
  const url = `https://hagamos-numeros-dg9k.bolt.host?juntadaId=${id}`;
  const text = `¡Che! Sumate a la juntada *"${name}"* para cargar tus gastos acá: ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};

const shareJuntada = async () => {
  const id = await ensureJuntadaExists();
  if (!id) return;
  const url = `https://hagamos-numeros-dg9k.bolt.host?juntadaId=${id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `Juntada: ${name}`, text: `Sumate a la división de gastos de "${name}"`, url });
    } catch (error) {
      console.error('Error al compartir:', error);
    }
  } else {
    navigator.clipboard.writeText(url);
    alert('¡Link de invitación copiado al portapapeles!');
  }
};

const handleShowQr = async () => {
  const id = await ensureJuntadaExists();
  if (!id) return;
  setShowQrModal(true);
};

  const copyForWhatsApp = () => {
    if (!calculations) return;
    let text = `*${name || 'Bar'}*\n------------------------\n`;
    text += `Total: ${formatCurrency(calculations.total)}\n`;
    if (calculations.tip > 0) text += `Propina (${tipPercentage}%): ${formatCurrency(calculations.tip)}\n`;
    text += `\n*Saldos:*\n`;
    calculations.balances.forEach((b) => {
      if (b.isRecaudador) {
        text += `👑 ${b.name} (Recauda): Paga su parte ${formatCurrency(Math.abs(b.balance))}\n`;
      } else {
        const partOriginal = participants?.find(p => p.name === b.name);
        if (partOriginal?.pago_efectivo) {
          text += `• ${b.name}: Pagó en efectivo ✅\n`;
        } else {
          text += `• ${b.name}: Debe transferir ${formatCurrency(Math.abs(b.balance))}\n`;
        }
      }
    });
    if (calculations.transfers.length > 0) {
      text += `\n*Transferencias:*\n`;
      calculations.transfers.forEach((t) => {
        text += `${t.from} → ${t.to}: ${formatCurrency(t.amount)}\n`;
      });
    }
    navigator.clipboard.writeText(text);
    alert('Resumen copiado. ¡Pegalo en el grupo!');
  };

  const toggleFocus = (key: string, isFocused: boolean) => {
    setFocusedInputs(prev => ({ ...prev, [key]: isFocused }));
  };

  const toggleRowExpansion = (index: number, field: 'alias' | 'gasto') => {
    setExpandedRows(prev => {
      const current = prev[index] || { alias: false, gasto: false };
      return { ...prev, [index]: { ...current, [field]: !current[field] } };
    });
  };

  return (
    //<div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <PullToRefresh onRefresh={() => juntadaId && loadJuntada(juntadaId)}>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} showBack onBack={onBack} />

      <main className="px-4 pb-8 md:px-6 max-w-2xl mx-auto">
        {/* Title */}
        <div className="mb-6 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Beer className="w-6 h-6 text-primary-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Modo Bar</h1>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveJuntada}
            placeholder="Nombre de la juntada"
            className="w-full bg-transparent border-b-2 border-gray-200 dark:border-gray-700 focus:border-primary-500 outline-none py-1 text-lg text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>

        {/* Total Block */}
        <div
          onClick={() => setIsEditingTotal(true)}
          className="bg-primary-500 rounded-2xl p-6 mb-6 text-white cursor-pointer hover:bg-primary-600 transition-colors"
        >
          <p className="text-sm opacity-80 mb-1">TOTAL DE LA CUENTA</p>
          {isEditingTotal ? (
            <input
              type="number"
              value={total || ''}
              onChange={(e) => setTotal(Number(e.target.value))}
              onBlur={() => {
                setIsEditingTotal(false);
                saveJuntada();
              }}
              autoFocus
              className="text-4xl font-bold bg-transparent border-none outline-none w-full text-white placeholder-white/60"
              placeholder="$ 0"
            />
          ) : (
            <p className="text-4xl font-bold">{formatCurrency(total)}</p>
          )}
          <p className="text-sm opacity-70 mt-2">Tocá para editar</p>
        </div>

        {/* Tip Section */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">PROPINA</p>
          <div className="flex gap-2">
            {[0, 10, 15].map((pct) => (
              <button
                key={pct}
                onClick={() => {
                  setTipPercentage(pct);
                  saveJuntada();
                }}
                className={`flex-1 py-3 rounded-full font-medium transition-all ${
                  tipPercentage === pct
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Participants Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">PARTICIPANTES</h2>
          </div>

          <div className="space-y-3">
            {participants.map((participant, index) => {
              const isExpanded = expandedRows[index] || { alias: false, gasto: false };
              const isGastoFocused = focusedInputs[`${index}-extra`];

              return (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      onClick={() => setRecaudador(index)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 ${
                        participant.is_recaudador
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      Recauda
                    </button>
                    <input
                      type="text"
                      value={participant.name}
                      onChange={(e) => updateParticipant(index, { name: e.target.value })}
                      onBlur={() => saveParticipant(index)}
                      placeholder="Nombre"
                      className="flex-1 bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-primary-500 outline-none py-1 text-gray-900 dark:text-white font-medium"
                    />
                    <button
                      onClick={() => removeParticipant(index)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      onClick={() => {
                        if (!participant.is_recaudador) {
                          alert('Solo el recaudador puede cargar alias.');
                          return;
                        }
                        toggleRowExpansion(index, 'alias');
                      }}
                      className={`w-full py-2.5 px-1 rounded-lg border transition-all font-medium text-center flex items-center justify-center ${
                        participant.is_recaudador
                          ? isExpanded.alias || participant.alias_bancario
                            ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          : 'bg-gray-50/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      CBU/Alias
                    </button>

                    <button
                      onClick={async () => {
                        const newValue = !participant.pago_efectivo;
                        updateParticipant(index, { pago_efectivo: newValue });
                        if (participant.id) {
                          await supabase
                            .from('participants')
                            .update({ pago_efectivo: newValue })
                            .eq('id', participant.id);
                        }
                      }}
                      className={`w-full py-2.5 px-1 rounded-lg border transition-all font-medium flex items-center justify-center gap-1 text-center ${
                        participant.pago_efectivo
                          ? 'bg-green-50 dark:bg-green-950/40 border-green-500 text-green-600 dark:text-green-400'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {participant.pago_efectivo && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                      Efectivo
                    </button>

                    <button
                      onClick={() => toggleRowExpansion(index, 'gasto')}
                      className={`w-full py-2.5 px-1 rounded-lg border transition-all font-medium text-center flex items-center justify-center ${
                        isExpanded.gasto || (participant.extra_amount || 0) > 0
                          ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-600 dark:text-purple-400'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      Gasto Individual
                    </button>
                  </div>

                  {((isExpanded.alias && participant.is_recaudador) || isExpanded.gasto) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800/60 flex flex-col gap-2.5">
                      {isExpanded.alias && participant.is_recaudador && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Alias / CBU (opcional)</label>
                          <input
                            type="text"
                            value={participant.alias_bancario || ''}
                            onChange={(e) => updateParticipant(index, { alias_bancario: e.target.value })}
                            onBlur={() => saveParticipant(index)}
                            placeholder="Ej: juan.mp o CBU..."
                            className="w-full bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-gray-700 focus:border-primary-500"
                          />
                        </div>
                      )}

                      {isExpanded.gasto && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-medium text-purple-600 dark:text-purple-400">Gasto extra (solo para esta persona)</label>
                          <input
                            type={isGastoFocused ? 'number' : 'text'}
                            inputMode={isGastoFocused ? 'decimal' : undefined}
                            value={isGastoFocused ? (participant.extra_amount || '') : formatCurrency(participant.extra_amount || 0)}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              updateParticipant(index, { extra_amount: val });
                            }}
                            onFocus={() => toggleFocus(`${index}-extra`, true)}
                            onBlur={() => {
                              toggleFocus(`${index}-extra`, false);
                              saveParticipant(index);
                            }}
                            placeholder="0"
                            className={`w-full bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none border transition-colors ${
                              isGastoFocused
                                ? 'border-purple-500 focus:border-purple-500'
                                : 'border-gray-200 dark:border-gray-700'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={addParticipant}
            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl py-4 mt-4 text-gray-500 dark:text-gray-400 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Agregar persona
          </button>
        </div>

        {/* Summary Card */}
        {calculations && participants.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">RESUMEN</h3>

            <div className="space-y-2 mb-4 pb-4 border-b border-b-gray-100 dark:border-b-gray-800">
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white mb-1">
                <span>Total del Ticket</span>
                <span>{formatCurrency(calculations.total)}</span>
              </div>

              {calculations.totalExtra > 0 && (
                <>
                  <div className="flex justify-between text-sm text-purple-600 dark:text-purple-400">
                    <span>Gastos individuales (a restar)</span>
                    <span>-{formatCurrency(calculations.totalExtra)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pt-1 pb-1 border-t border-dashed border-gray-200 dark:border-gray-800">
                    <span>Monto base a dividir</span>
                    <span>{formatCurrency(calculations.total - calculations.totalExtra)}</span>
                  </div>
                </>
              )}

              {calculations.tip > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Propina ({tipPercentage}%)</span>
                  <span>{formatCurrency(calculations.tip)}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
              {calculations.balances.map((b, i) => (
                <div key={i} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800/50 last:border-0">
                  <span className="text-gray-700 dark:text-gray-300 flex items-center text-sm">
                    {b.isRecaudador && (
                      <span className="inline-block px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-[10px] mr-2 font-medium tracking-wide uppercase">
                        Recauda
                      </span>
                    )}
                    {b.name}
                  </span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                    {formatCurrency(b.balance)}
                  </span>
                </div>
              ))}
            </div>

            {calculations.transfers.length > 0 && (
              <div className="space-y-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Transferencias</p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
                  {calculations.transfers.map((t, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {t.from} <span className="text-gray-400 font-normal">→</span> {t.to}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={copyForWhatsApp}
              className="w-full bg-primary-500 hover:bg-primary-600 text-white rounded-xl py-3 flex items-center justify-center gap-2 font-medium transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copiar para WhatsApp
            </button>

            {participants.find(p => p.is_recaudador)?.alias_bancario && (
              <button
                onClick={() => {
                  const alias = participants.find(p => p.is_recaudador)?.alias_bancario?.trim() || '';
                  navigator.clipboard.writeText(alias);
                  alert('¡Alias copiado!');
                }}
                className="w-full mt-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl py-2.5 flex items-center justify-center gap-2 font-medium text-sm transition-colors border border-gray-200 dark:border-gray-700"
              >
                <Copy className="w-4 h-4" />
                Copiar solo el Alias ({participants.find(p => p.is_recaudador)?.alias_bancario})
              </button>
            )}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={inviteViaWhatsApp}
              className="flex-1 min-w-[140px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-green-500" />
              Invitar por WhatsApp
            </button>
            <button
              onClick={shareJuntada}
              className="flex-1 min-w-[140px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Share2 className="w-4 h-4 text-blue-500" />
              Compartir
            </button>
            <button
              onClick={() => handleShowQr()}
              className="flex-1 min-w-[140px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <QrCode className="w-4 h-4 text-purple-500" />
              Código QR
            </button>
          </div>

          <button
            onClick={deleteJuntada}
            className="w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl py-3 text-red-600 dark:text-red-400 flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Borrar juntada
          </button>
        </div>
      </main>

      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full p-6 relative border border-gray-100 dark:border-gray-800 shadow-xl">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center mt-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Escanear para unirse</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                Mostrale la pantalla a tus amigos para que se sumen a "{name}"
              </p>
              <div className="bg-white p-4 rounded-xl inline-block border border-gray-100 shadow-md mb-6 mx-auto">
                <img
                  src={getNativeQrUrl(getShareUrl())}
                  alt="Código QR"
                  className="w-[200px] h-[200px]"
                  loading="lazy"
                />
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getShareUrl());
                  alert('¡Link copiado!');
                }}
                className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Copiar enlace de invitación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
      </PullToRefresh>
  );
}
