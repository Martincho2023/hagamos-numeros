import { useState, useEffect, useRef } from 'react';
import { Home, Plus, Trash2, Check, Copy, Share2, QrCode, MessageCircle, X } from 'lucide-react';
import { Header } from '../components/Header';
import { supabase, Participant } from '../lib/supabase';
import { formatCurrency, calculateCasaMode, CalculationResult } from '../utils/calculations';
import { PullToRefresh } from '../components/PullToRefresh';

function getNativeQrUrl(text: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&ecc=M&margin=0`;
}

interface CasaModeScreenProps {
  juntadaId?: string;
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  userName?: string;
}

interface InputFocusState {
  [key: string]: boolean;
}

export function CasaModeScreen({
  juntadaId,
  onBack,
  darkMode,
  userName,
  onToggleDarkMode,
}: CasaModeScreenProps) {
  const [name, setName] = useState('Casa');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [calculations, setCalculations] = useState<CalculationResult | null>(null);
  const [currentJuntadaId, setCurrentJuntadaId] = useState<string | null>(juntadaId || null);
  const [focusedInputs, setFocusedInputs] = useState<InputFocusState>({});
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
      // Caso: juntada nueva → inicializar con el usuario en memoria (sin tocar DB todavía)
      setParticipants([{
        id: '',
        juntada_id: '',
        name: userName,
        alias_bancario: '',
        pago_efectivo: false,
        is_recaudador: false,
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
          alias_bancario: '',
          pago_efectivo: false,
          is_recaudador: false,
          amount_spent: 0,
          extra_amount: 0,
        });
        // Recargar solo participantes sin tocar el resto del estado
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

  // ─── RECALCULAR cuando cambian los participantes ───
  useEffect(() => {
    recalculate();
  }, [participants]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── CREAR JUNTADA SOLO CUANDO EL USUARIO HACE ALGO ───
  const ensureJuntadaExists = async (): Promise<string | null> => {
    if (currentJuntadaId) return currentJuntadaId;

    // Si ya hay una creación en curso, esperamos ese resultado en vez de crear otra
    if (creatingJuntadaRef.current) return creatingJuntadaRef.current;

    const doCreate = async (): Promise<string | null> => {
      // Segunda verificación dentro del lock (por si se seteó mientras esperábamos)
      if (currentJuntadaId) return currentJuntadaId;

      const { data: juntada, error } = await supabase
        .from('juntadas')
        .insert({
          name: name || 'Casa',
          mode: 'casa',
          total: 0,
          tip_percentage: 0,
          extra_expenses_enabled: false,
        })
        .select('id')
        .single();

      if (error || !juntada) {
        console.error('Error creando juntada:', error);
        return null;
      }

      // Solo actualizamos el juntada_id en memoria, sin insertar el participante todavía.
      // saveParticipant lo insertará cuando el usuario pierda el foco del input.
      setParticipants(prev =>
        prev.map(p => p.id === '' ? { ...p, juntada_id: juntada.id } : p)
      );

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
      .update({ name, extra_expenses_enabled: false })
      .eq('id', id);
  };

  // ─── RECALCULAR ───
  const recalculate = () => {
    if (participants.length === 0) {
      setCalculations(null);
      return;
    }
    const result = calculateCasaMode(
      participants.map(p => ({
        name: p.name,
        amount_spent: Number(p.amount_spent || 0),
        extra_amount: 0,
      }))
    );
    setCalculations(result);
  };

  const totalGeneral = participants.reduce((sum, p) => sum + Number(p.amount_spent || 0), 0);
  const promedioPorCabeza = participants.length > 0 ? totalGeneral / participants.length : 0;

  // ─── PARTICIPANTES ───
  const addParticipant = async () => {
    const id = await ensureJuntadaExists();
    const newParticipant: Participant = {
      id: '',
      juntada_id: id || '',
      name: '',
      alias_bancario: '',
      pago_efectivo: false,
      is_recaudador: false,
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
            amount_spent: participant.amount_spent,
            extra_amount: 0,
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
            is_recaudador: false,
            amount_spent: participant.amount_spent,
            extra_amount: 0,
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

    let text = `*${name || 'Casa'}*\n------------------------\n`;
    text += `Total gastado: ${formatCurrency(totalGeneral)}\n`;
    text += `Gasto por persona: ${formatCurrency(promedioPorCabeza)}\n`;
    text += `\n*Balances individuales:*\n`;

    participants.forEach((p) => {
      const loQueAporto = Number(p.amount_spent || 0);
      const balance = loQueAporto - promedioPorCabeza;
      const leDeben = balance > 0;
      const esCero = balance === 0;
      const nombre = p.name || 'Anónimo';

      if (esCero) {
        text += `• ${nombre}: Gastó ${formatCurrency(loQueAporto)} → Al día\n`;
      } else if (leDeben) {
        text += `• ${nombre}: Gastó ${formatCurrency(loQueAporto)} → Le deben ${formatCurrency(balance)}\n`;
      } else {
        text += `• ${nombre}: Gastó ${formatCurrency(loQueAporto)} → Debe ${formatCurrency(Math.abs(balance))}\n`;
      }
    });

    if (calculations.transfers.length > 0) {
      text += `\n*Transferencias sugeridas:*\n`;
      calculations.transfers.forEach((t) => {
        const emisorPagaEfectivo = participants.find(p => p.name === t.from)?.pago_efectivo;
        if (!emisorPagaEfectivo) {
          text += `• ${t.from} → ${t.to}: ${formatCurrency(t.amount)}\n`;
        }
      });
    }

    navigator.clipboard.writeText(text);
    alert('Resumen copiado. ¡Pegalo en el grupo!');
  };

  const toggleFocus = (key: string, isFocused: boolean) => {
    setFocusedInputs(prev => ({ ...prev, [key]: isFocused }));
  };

  const primerDestinatarioConAlias = calculations?.transfers?.find(t => {
    const p = participants.find(part => part.name === t.to);
    return p && p.alias_bancario && p.alias_bancario.trim() !== '';
  })?.to;

  const aliasParaCopiar = primerDestinatarioConAlias
    ? participants.find(part => part.name === primerDestinatarioConAlias)?.alias_bancario?.trim()
    : '';

  return (
    //<div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <PullToRefresh onRefresh={() => juntadaId && loadJuntada(juntadaId)}>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} showBack onBack={onBack} />

      <main className="px-4 pb-8 md:px-6 max-w-2xl mx-auto">
        {/* Title */}
        <div className="mb-6 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Home className="w-6 h-6 text-primary-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Modo Casa</h1>
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

        {/* Participants Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">PARTICIPANTES</h2>
          </div>

          <div className="space-y-3">
            {participants.map((participant, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800"
              >
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    value={participant.name}
                    onChange={(e) => updateParticipant(index, { name: e.target.value })}
                    onBlur={() => saveParticipant(index)}
                    placeholder="Nombre"
                    className="flex-1 bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-primary-500 outline-none py-1 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() => removeParticipant(index)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    value={participant.alias_bancario}
                    onChange={(e) => updateParticipant(index, { alias_bancario: e.target.value })}
                    onBlur={() => saveParticipant(index)}
                    placeholder="Alias / CBU (opcional)"
                    className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none border border-gray-200 dark:border-gray-700"
                  />
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
                    className={`p-2 rounded-full transition-colors ${
                      participant.pago_efectivo
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Paga en Efectivo</span>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Gastó</p>
                  <input
                    type={focusedInputs[`${index}-spent`] ? 'number' : 'text'}
                    inputMode={focusedInputs[`${index}-spent`] ? 'decimal' : 'text'}
                    value={
                      focusedInputs[`${index}-spent`]
                        ? (participant.amount_spent || '')
                        : formatCurrency(participant.amount_spent || 0)
                    }
                    onChange={(e) => updateParticipant(index, { amount_spent: Number(e.target.value) })}
                    onFocus={() => toggleFocus(`${index}-spent`, true)}
                    onBlur={() => {
                      toggleFocus(`${index}-spent`, false);
                      saveParticipant(index);
                    }}
                    placeholder="$ 0"
                    className="w-full bg-white dark:bg-gray-900 rounded px-3 py-2 text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-gray-700 text-left"
                  />
                </div>
              </div>
            ))}
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
        {participants.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">RESUMEN</h3>

            <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl space-y-2 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total gastado</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totalGeneral)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">
                <span>Gasto por persona ({participants.length})</span>
                <span className="font-medium">{formatCurrency(promedioPorCabeza)}</span>
              </div>
            </div>

            {/* Balances Individuales */}
            <div className="mb-6">
              <p className="text-xs font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase mb-3">
                Balances individuales
              </p>
              <div className="space-y-2">
                {participants.map((p, i) => {
                  const loQueAporto = Number(p.amount_spent || 0);
                  const balance = loQueAporto - promedioPorCabeza;
                  const leDeben = balance > 0;
                  const esCero = Math.abs(balance) < 1;

                  return (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50 last:border-0 text-sm">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {p.name || 'Anónimo'}
                      </span>

                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <span>Gastó {formatCurrency(loQueAporto)}</span>

                        {!esCero && (
                          <>
                            <span className="text-gray-400 dark:text-gray-600">→</span>
                            <span className={`font-semibold ${leDeben ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                              {leDeben ? 'Le deben' : 'Debe'} {formatCurrency(Math.abs(balance))}
                            </span>
                          </>
                        )}

                        {esCero && (
                          <>
                            <span className="text-gray-400 dark:text-gray-600">→</span>
                            <span className="font-medium text-gray-400 dark:text-gray-500">Al día</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transfers */}
            {calculations && calculations.transfers.length > 0 && (
              <div className="space-y-2 mb-6">
                <p className="text-xs font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase mb-3">
                  Transferencias sugeridas
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
                  {calculations.transfers
                    .filter(t => !participants.find(p => p.name === t.from)?.pago_efectivo)
                    .map((t, i) => (
                      <div key={i} className="flex justify-between text-sm items-center">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {t.from} <span className="text-gray-400 font-normal">→</span> {t.to}
                        </span>
                        <span className="font-semibold text-gray-950 dark:text-white">
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

            {aliasParaCopiar && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(aliasParaCopiar);
                  alert('¡Alias copiado!');
                }}
                className="w-full mt-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl py-2.5 flex items-center justify-center gap-2 font-medium text-sm transition-colors border border-gray-200 dark:border-gray-700"
              >
                <Copy className="w-4 h-4" />
                Copiar solo el Alias ({aliasParaCopiar})
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
