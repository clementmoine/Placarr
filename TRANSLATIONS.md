# Internationalization (i18n) Guide

This document explains how to use the translation system in the Placarr app.

## Overview

The app supports multiple languages (currently English and French) using a JSON-based translation system with Next.js App Router.

## How It Works

### 1. URL Structure
- URLs include the locale: `/en/shelves`, `/fr/shelves`
- The root `/` redirects to the best available locale
- Locale is detected from: URL > localStorage > browser language > default (en)

### 2. Translation Files
- `src/messages/en.json` - English translations
- `src/messages/fr.json` - French translations
- Translations are organized by feature (common, navigation, auth, shelves, items, app)

### 3. Using Translations in Components

#### Basic Usage
```tsx
import { useLocale } from "@/lib/providers/LocaleProvider";

export function MyComponent() {
  const { t, locale, changeLocale } = useLocale();
  
  return (
    <div>
      <h1>{t('common.title')}</h1>
      <p>{t('shelves.description')}</p>
      <button onClick={() => changeLocale('fr')}>
        Switch to French
      </button>
    </div>
  );
}
```

#### Available Functions
- `t(key)` - Get translated text for a key
- `locale` - Current locale (en/fr)
- `changeLocale(newLocale)` - Switch to a different locale
- `availableLocales` - Array of supported locales
- `isLoading` - Whether translations are loading

### 4. Adding New Translations

#### 1. Add to English file (`src/messages/en.json`)
```json
{
  "newFeature": {
    "title": "New Feature",
    "description": "This is a new feature"
  }
}
```

#### 2. Add to French file (`src/messages/fr.json`)
```json
{
  "newFeature": {
    "title": "Nouvelle Fonctionnalité",
    "description": "Ceci est une nouvelle fonctionnalité"
  }
}
```

#### 3. Use in component
```tsx
const { t } = useLocale();
<h1>{t('newFeature.title')}</h1>
<p>{t('newFeature.description')}</p>
```

### 5. Locale Switcher

The `LocaleSwitcher` component is automatically included in the Header and allows users to switch between languages.

### 6. Persistent Language Preference

User's language preference is stored in localStorage and will be remembered across browser sessions.

## File Structure

```
src/
├── lib/
│   ├── i18n.ts              # Core i18n utilities
│   ├── locale-utils.ts      # Locale detection helpers
│   ├── hooks/
│   │   └── useTranslations.ts  # Translation hook
│   └── providers/
│       └── LocaleProvider.tsx   # Context provider
├── components/
│   └── LocaleSwitcher.tsx   # Language switcher component
├── messages/
│   ├── en.json              # English translations
│   └── fr.json              # French translations
└── app/
    ├── [locale]/            # Locale-specific routes
    │   ├── layout.tsx       # Locale layout
    │   ├── page.tsx         # Home page
    │   ├── shelves/         # Shelves pages
    │   └── auth/            # Auth pages
    └── layout.tsx           # Root layout with providers
```

## Best Practices

1. **Always use translation keys** instead of hardcoded text
2. **Organize translations logically** by feature
3. **Use descriptive keys** that make sense in context
4. **Test both languages** when adding new features
5. **Handle missing translations gracefully** (the system falls back to the key)

## Testing

Visit `/en/test-translations` or `/fr/test-translations` to see all translations in action and test the locale switching functionality.

## Adding New Languages

1. Create `src/messages/[locale].json`
2. Add the locale to `src/lib/i18n.ts` locales array
3. Update `src/types/i18n.ts` Locale type
4. Add locale name to `src/components/LocaleSwitcher.tsx`

Example for Spanish:
```tsx
// src/lib/i18n.ts
export const locales: Locale[] = ['en', 'fr', 'es'];

// src/types/i18n.ts
export type Locale = 'en' | 'fr' | 'es';

// src/components/LocaleSwitcher.tsx
const localeNames: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español'
};
```
