// src/components/WelcomeModal.tsx
import { useState, useEffect } from 'react';
import { User } from 'lucide-react';

interface WelcomeModalProps {
  onNameSaved: (name: string) => void;
}

export function WelcomeModal({ onNameSaved }: WelcomeModalProps) {
  const [name, setName] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Verificamos si ya guardamos el nombre en este dispositivo
    const savedName = localStorage.getItem('user_profile_name');
    if (!savedName) {
      setIsOpen(true);
    } else {
      onNameSaved(savedName);
    }
  }, [onNameSaved]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    localStorage.setItem('user_profile_name', cleanName);
    setIsOpen(false);
    onNameSaved(cleanName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-gray-800 transform transition-all scale-100">
        <div className="w-12 h-12 bg-primary-50 dark:bg-primary-950/50 rounded-full flex items-center justify-center mb-4 text-primary-500">
          <User className="w-6 h-6" />
        </div>
        
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">¿Cómo te llamás?</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Ingresá tu nombre para que los demás participantes puedan identificarte en la juntada.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre o apodo"
            maxLength={25}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-gray-700 focus:border-primary-500 font-medium transition-colors"
          />
          <button
            type="submit"
            className="w-full bg-primary-500 hover:bg-primary-600 text-white rounded-xl py-3 font-medium transition-all shadow-sm active:scale-[0.98]"
          >
            Continuar
          </button>
        </form>
      </div>
    </div>
  );
}