import { Beer, Home } from 'lucide-react';
import { Header } from '../components/Header';

interface ModeSelectionScreenProps {
  onBack: () => void;
  onSelectBar: () => void;
  onSelectCasa: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function ModeSelectionScreen({
  onBack,
  onSelectBar,
  onSelectCasa,
  darkMode,
  onToggleDarkMode,
}: ModeSelectionScreenProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} showBack onBack={onBack} />

      <main className="px-4 pb-8 md:px-6 max-w-2xl mx-auto">
        <div className="text-center mb-8 mt-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Nueva juntada
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Elegí el modo que mejor se adapta a la situación.
          </p>
        </div>

        <div className="space-y-4">
          {/* Modo Bar Card */}
          <button
            onClick={onSelectBar}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-800 group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                <Beer className="w-7 h-7 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  Modo Bar
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Una persona paga todo. El resto le devuelve.
                </p>
              </div>
            </div>
          </button>

          {/* Modo Casa Card */}
          <button
            onClick={onSelectCasa}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-800 group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                <Home className="w-7 h-7 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  Modo Casa
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Varios pusieron plata. Neteamos deudas entre todos.
                </p>
              </div>
            </div>
          </button>
        </div>
      </main>
    </div>
  );
}
