import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { env } from '@/env';
import es from './locales/es.json';
import en from './locales/en.json';
import fr from './locales/fr.json';

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: env.VITE_DEFAULT_LOCALE,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
