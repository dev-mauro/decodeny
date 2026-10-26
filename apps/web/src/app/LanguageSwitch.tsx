import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LOCALES, setLocale, type Locale } from '@/i18n';

const NAMES: Record<Locale, string> = { es: 'Español', en: 'English' };

/** Idioma de la interfaz. */
export function LanguageSwitch() {
  const { i18n } = useTranslation();
  return (
    <label className="flex items-center gap-1 text-sm text-slate-600">
      <Languages className="size-4 text-slate-400" aria-hidden />
      <span className="sr-only">Idioma / Language</span>
      <select
        className="h-8 rounded-md bg-transparent px-1 text-sm outline-none hover:bg-slate-100 focus:ring-2 focus:ring-brand-100"
        value={i18n.language.startsWith('en') ? 'en' : 'es'}
        onChange={(e) => setLocale(e.target.value as Locale)}
        data-testid="language"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
