import { useState, useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { BarModeScreen } from './screens/BarModeScreen';
import { CasaModeScreen } from './screens/CasaModeScreen';
import { WelcomeModal } from './components/WelcomeModal'; // Importamos el modal que creamos
import { supabase } from './lib/supabase';

// Eliminamos 'mode-selection' de los estados de pantalla válidos
type Screen = 'home' | 'bar-mode' | 'casa-mode';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [darkMode, setDarkMode] = useState(false);
  const [viewJuntadaId, setViewJuntadaId] = useState<string | undefined>();
  const [viewJuntadaMode, setViewJuntadaMode] = useState<'bar' | 'casa' | undefined>();
  const [userName, setUserName] = useState<string>(''); // Estado para almacenar el nombre en memoria global

  useEffect(() => {
    // Check for saved dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode) {
      setDarkMode(JSON.parse(savedDarkMode));
    }
  }, []);

  useEffect(() => {
    // Apply dark mode class to document
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

 useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('juntadaId');
    
    if (id) {
      console.log("Detectado ID por QR:", id);
      setViewJuntadaId(id);
      
      // Consultamos la base de datos para saber qué modo es
      supabase
        .from('juntadas')
        .select('modo')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Error al buscar el modo de la juntada:", error);
          } else if (data) {
            console.log("Modo detectado:", data.modo);
            setCurrentScreen(data.mode === 'bar' ? 'bar-mode' : 'casa-mode');
          }
        });
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const navigateToHome = () => {
    setCurrentScreen('home');
    setViewJuntadaId(undefined);
    setViewJuntadaMode(undefined);
  };

  // Esta es la función clave que recibe el modo desde los botones verdes de la HomeScreen
  const handleNewJuntada = (mode: 'bar' | 'casa') => {
    setViewJuntadaId(undefined); // Al ser nueva, no viene de un ID del historial
    setViewJuntadaMode(mode);
    setCurrentScreen(mode === 'bar' ? 'bar-mode' : 'casa-mode');
  };

  const handleViewJuntada = (id: string, mode: 'bar' | 'casa') => {
    setViewJuntadaId(id);
    setViewJuntadaMode(mode);
    setCurrentScreen(mode === 'bar' ? 'bar-mode' : 'casa-mode');
  };

  return (
    <>
      {/* Intercepta al usuario si no tiene nombre, tanto creador como invitados */}
      <WelcomeModal onNameSaved={(name) => {
  setUserName(name);
  console.log("Nombre guardado y listo para registrar:", name);
}} />

      {currentScreen === 'home' && (
        <HomeScreen
          onNewJuntada={handleNewJuntada} // Pasamos la nueva función controladora
          onViewJuntada={handleViewJuntada}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}

      {currentScreen === 'bar-mode' && (
        <BarModeScreen
          juntadaId={viewJuntadaId}
          userName={userName} // <--- AGREGAR ESTO
          onBack={navigateToHome}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}

      {currentScreen === 'casa-mode' && (
        <CasaModeScreen
          juntadaId={viewJuntadaId}
          userName={userName} // <--- AGREGAR ESTO
          onBack={navigateToHome}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}
    </>
  );
}

export default App;