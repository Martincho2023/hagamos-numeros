import { useState, useEffect } from 'react';
import { Beer, Home, Trash2 } from 'lucide-react';
import { Header } from '../components/Header';
import { supabase, JuntadaWithParticipants } from '../lib/supabase';
import { formatCurrency, formatDate } from '../utils/calculations';

interface HomeScreenProps {
  onNewJuntada: (mode: 'bar' | 'casa') => void;
  onViewJuntada: (id: string, mode: 'bar' | 'casa') => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  userName: string; 
}

export function HomeScreen({ onNewJuntada, onViewJuntada, darkMode, onToggleDarkMode, userName }: HomeScreenProps) {
  const [juntadas, setJuntadas] = useState<JuntadaWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJuntadas = async () => {
  if (!userName) return;
  try {
    const { data, error } = await supabase
      .from('participants')
      .select('juntadas(*, participants(*))')
      .eq('name', userName)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const juntadasDelUsuario = data
      ?.map((p: any) => p.juntadas)
      .filter(Boolean) || [];

    setJuntadas(juntadasDelUsuario as any);
  } catch (error) {
    console.error('Error loading juntadas:', error);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const idFromUrl = params.get('juntadaId');

  if (idFromUrl) {
    loadJuntadaEspecifica(idFromUrl);
  } else if (userName) {
    loadJuntadas();
  }
}, [userName]);

  const loadJuntadaEspecifica = async (id: string) => {
  try {
    setLoading(true);
    const { data, error } = await supabase
      .from('juntadas')
      .select('*, participants(*)')
      .eq('id', id) // <--- ESTO FILTRA: Solo trae la que corresponde al ID
      .single();    // <--- TRAE UN SOLO OBJETO, NO UNA LISTA

    if (error) throw error;
    // Ahora guardas solo esa juntada
    setJuntadas([data]);
  } catch (error) {
    console.error('Error al cargar la juntada:', error);
  } finally {
    setLoading(false);
  }
};

  const handleDeleteJuntada = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Evita que se dispare cualquier otro click
    
    const confirmDelete = window.confirm('¿Estás seguro de que querés eliminar esta juntada? Se borrarán todos los datos asociados.');
    if (!confirmDelete) return;

    try {
      // 1. Borrar participantes asociados (Si no tenés ON DELETE CASCADE configurado en Supabase)
      await supabase
        .from('participants')
        .delete()
        .eq('juntada_id', id);

      // 2. Borrar la juntada
      const { error } = await supabase
        .from('juntadas')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // 3. Actualizar el estado local para que desaparezca al toque
      setJuntadas((prev) => prev.filter((j) => j.id !== id));
    } catch (error) {
      console.error('Error deleting juntada:', error);
      alert('No se pudo eliminar la juntada. Probá de nuevo.');
    }
  };

  const calculateTotal = (juntada: JuntadaWithParticipants): number => {
    // Si es modo BAR, el total ya incluye Ticket + Propina + Ajuste de extras.
    // No hace falta sumar nada más.
    if (juntada.mode === 'bar') {
      return Number(juntada.total || 0);
    }
    
    // Si es MODO CASA, seguimos calculando la suma manual de lo que cada uno aportó.
    const subtotal = juntada.participants.reduce((sum, p) => sum + Number(p.amount_spent || 0), 0);
    const tip = (subtotal * juntada.tip_percentage) / 100;
    const extras = juntada.participants.reduce((sum, p) => sum + Number(p.extra_amount || 0), 0);
    
    return subtotal + tip + extras;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />

      <main className="px-4 pb-8 md:px-6 max-w-2xl mx-auto">
        {/* Badge */}
        <div className="text-center mb-6">
          <span className="inline-block px-4 py-2 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm font-medium">
            Justicia financiera, sin drama
          </span>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3">
            Hagamos Números
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Dividí gastos en segundos. Sin centavos perdidos.
          </p>
        </div>

        {/* Grid de Accesos Directos - Botones Verdes Sólidos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 w-full">
          
          {/* Botón Modo Bar (Verde Sólido) */}
          <button
            onClick={() => onNewJuntada('bar')}
            className="flex flex-col items-center justify-center p-6 bg-primary-500 hover:bg-primary-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all group text-center border border-transparent"
          >
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-semibold mb-3 group-hover:scale-110 transition-transform">
              <Beer className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-white text-lg block mb-1">
              Modo Bar
            </span>
            <span className="text-xs text-white/80 max-w-[180px]">
              Un pagador principal, extras individuales y propina.
            </span>
          </button>

          {/* Botón Modo Casa (Verde Sólido) */}
          <button
            onClick={() => onNewJuntada('casa')}
            className="flex flex-col items-center justify-center p-6 bg-primary-500 hover:bg-primary-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all group text-center border border-transparent"
          >
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-semibold mb-3 group-hover:scale-110 transition-transform">
              <Home className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-white text-lg block mb-1">
              Modo Casa
            </span>
            <span className="text-xs text-white/80 max-w-[180px]">
              Muchos compradores, cuentas cruzadas y división pareja.
            </span>
          </button>
          
        </div>

        {/* Historial Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Historial</h2>
            <button className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
              Ver todo
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-800 rounded-xl h-24" />
              ))}
            </div>
          ) : juntadas.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>No hay juntadas previas</p>
              <p className="text-sm mt-2">Elegí un modo arriba para empezar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {juntadas.map((juntada) => {
                const total = calculateTotal(juntada);
                const numPeople = juntada.participants.length;

                return (
                  <div
                    key={juntada.id}
                    className="w-full bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border border-gray-100 dark:border-gray-800 group/card"
                  >
                    {/* Botón de Zona Clickable para entrar a la juntada */}
                    <button
                      onClick={() => onViewJuntada(juntada.id, juntada.mode)}
                      className="flex-1 flex items-center gap-4 text-left min-w-0"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        {juntada.mode === 'bar' ? (
                          <Beer className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        ) : (
                          <Home className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover/card:text-primary-600 dark:group-hover/card:text-primary-400 transition-colors">
                          {juntada.name || (juntada.mode === 'bar' ? 'Bar' : 'Casa')}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(juntada.created_at)} • {numPeople} persona{numPeople !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </button>

                    {/* Contenedor de Monto + Botón Eliminar */}
                    <div className="flex items-center gap-3 flex-shrink-0 pl-2">
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary-600 dark:text-primary-400">
                          {formatCurrency(total)}
                        </p>
                      </div>
                      
                      {/* Botón Eliminar sutil (aparece con más opacidad al hacer hover en desktop) */}
                      <button
                        onClick={(e) => handleDeleteJuntada(e, juntada.id)}
                        className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all md:opacity-40 group-hover/card:opacity-100"
                        title="Eliminar juntada"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}