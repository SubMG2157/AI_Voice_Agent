import React from 'react';
import { Language } from '../types';

interface LanguageSelectorProps {
  selected: Language;
  onSelect: (lang: Language) => void;
  disabled: boolean;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selected, onSelect, disabled }) => {
  return (
    <div className="flex gap-2 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
      {Object.values(Language).map((lang) => (
        <button
          key={lang}
          onClick={() => onSelect(lang)}
          disabled={disabled}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
            ${selected === lang 
              ? 'bg-[#003366] text-amber-400 border border-amber-500/50 shadow-lg' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {lang}
        </button>
      ))}
    </div>
  );
};

export default LanguageSelector;