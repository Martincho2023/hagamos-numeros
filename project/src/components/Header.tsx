import { Sun, Moon } from 'lucide-react';

interface HeaderProps {
  title?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  showBack?: boolean;
  onBack?: () => void;
}

export function Header({ title, darkMode, onToggleDarkMode, showBack, onBack }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-4 md:px-6">
      <div className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-primary-500 dark:text-white dark:hover:text-primary-400 transition-colors">
        {showBack && (
          <button onClick={onBack} className="text-sm font-medium">
            ← Nueva juntada
          </button>
        )}
        {!showBack && (
          <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
            Hagamos Números
          </h1>
        )}
      </div>
      {title && !showBack && (
        <div className="hidden md:block text-center flex-1">
          <span className="text-sm text-gray-600 dark:text-gray-400">{title}</span>
        </div>
      )}
      <button
        onClick={onToggleDarkMode}
        className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 transition-colors"
        aria-label="Toggle dark mode"
      >
        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    </header>
  );
}
