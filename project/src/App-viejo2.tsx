import { useState, useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { BarModeScreen } from './screens/BarModeScreen';
import { CasaModeScreen } from './screens/CasaModeScreen';
import { WelcomeModal } from './components/WelcomeModal';
import { supabase } from './lib/supabase';

type Screen = 'home' | 'bar-mode' | 'casa-mode';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [darkMode, setDarkMode] = useState(false);
  const [viewJuntadaId, setViewJuntadaId] = useState<string | undefined>();
  const [userName, setUserName] = useState<string>('');
  // Guardamos el ID del QR hasta que el usuario tenga nombre
  const [pendingQrId, setPendingQrId] = useState<string | null>(null);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode) setDarkMode(JSON.parse(savedDarkMode));
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Detectar QR al cargar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('juntadaId');
    if (id) {
      setPendingQrId(id);
    }
  }, []);

  // Cuando el usuario tiene nombre Y hay un QR pendiente → navegar a la juntada
  useEffect(() => {
    if (!userName || !pendingQrId) return;

    supabase
      .from('juntadas')
      .select('mode')
      .eq('id', pendingQrId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error('Error al buscar la juntada:', error);
          return;
        }
        setViewJuntadaId(pendingQrId);
        setCurrentScreen(data.mode === 'bar' ? 'bar-mode' : 'casa-mode');
        setPendingQrId(null);
      });
  }, [userName, pendingQrId]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  const navigateToHome = () => {
    setCurrentScreen('home');
    setViewJuntadaId(undefined);
    // Limpiar el parámetro de la URL
  window.history.replaceState({}, '', window.location.pathname);
  };

  const handleNewJuntada = (mode: 'bar' | 'casa') => {
    setViewJuntadaId(undefined);
    setCurrentScreen(mode === 'bar' ? 'bar-mode' : 'casa-mode');
  };

  const handleViewJuntada = (id: string, mode: 'bar' | 'casa') => {
    setViewJuntadaId(id);
    setCurrentScreen(mode === 'bar' ? 'bar-mode' : 'casa-mode');
  };

  return (
    <>
      <WelcomeModal onNameSaved={(name) => setUserName(name)} />

      {currentScreen === 'home' && (
        <HomeScreen
          onNewJuntada={handleNewJuntada}
          onViewJuntada={handleViewJuntada}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}

      {currentScreen === 'bar-mode' && (
        <BarModeScreen
          juntadaId={viewJuntadaId}
          userName={userName}
          onBack={navigateToHome}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}

      {currentScreen === 'casa-mode' && (
        <CasaModeScreen
          juntadaId={viewJuntadaId}
          userName={userName}
          onBack={navigateToHome}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}
    </>
  );
}

export default App;
