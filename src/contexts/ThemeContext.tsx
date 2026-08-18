import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';
export type ColorTheme = 'purple' | 'green' | 'blue' | 'rose' | 'orange' | 'teal' | 'red' | 'black' | 'navy' | 'gold' | 'cyan' | 'magenta';
type BoardColorMode = 'colorful' | 'single';
type BoardSingleColor = 'amber' | 'sky' | 'violet' | 'emerald' | 'slate' | 'rose' | 'cyan' | 'lime' | 'orange' | 'indigo' | 'pink' | 'primary' | 'custom';
type ColorfulPreset = 'default' | 'sunset' | 'ocean' | 'forest' | 'berry' | 'earth' | 'neon' | 'pastel' | 'mono' | 'candy';
export type UiVariant = 'standard' | 'glass';
export type ToolbarStyle = 'classic' | 'dark' | 'logo-wall' | 'midnight' | 'glass';
export type SurfaceStyle = 'clean' | 'soft' | 'glass' | 'contrast';
export type CanvasStyle = 'aurora' | 'clean' | 'mesh' | 'midnight';

export interface StockStatusColors {
  orderedColor: string;
  receivedColor: string;
}

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  colorTheme: ColorTheme;
  boardColorMode: BoardColorMode;
  boardSingleColor: BoardSingleColor;
  colorfulPreset: ColorfulPreset;
  customBoardColor: string;
  stockStatusColors: StockStatusColors;
  uiVariant: UiVariant;
  toolbarStyle: ToolbarStyle;
  surfaceStyle: SurfaceStyle;
  canvasStyle: CanvasStyle;
  setTheme: (theme: Theme) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
  setBoardColorMode: (mode: BoardColorMode) => void;
  setBoardSingleColor: (color: BoardSingleColor) => void;
  setColorfulPreset: (preset: ColorfulPreset) => void;
  setCustomBoardColor: (color: string) => void;
  setStockStatusColors: (colors: StockStatusColors) => void;
  setUiVariant: (variant: UiVariant) => void;
  setToolbarStyle: (style: ToolbarStyle) => void;
  setSurfaceStyle: (style: SurfaceStyle) => void;
  setCanvasStyle: (style: CanvasStyle) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const stockStatusColorOptions = [
  { name: 'Blue', value: '#3b82f6', bgClass: 'bg-blue-500', borderClass: 'border-blue-500' },
  { name: 'Green', value: '#22c55e', bgClass: 'bg-green-500', borderClass: 'border-green-500' },
  { name: 'Purple', value: '#a855f7', bgClass: 'bg-purple-500', borderClass: 'border-purple-500' },
  { name: 'Orange', value: '#f97316', bgClass: 'bg-orange-500', borderClass: 'border-orange-500' },
  { name: 'Red', value: '#ef4444', bgClass: 'bg-red-500', borderClass: 'border-red-500' },
  { name: 'Cyan', value: '#06b6d4', bgClass: 'bg-cyan-500', borderClass: 'border-cyan-500' },
  { name: 'Pink', value: '#ec4899', bgClass: 'bg-pink-500', borderClass: 'border-pink-500' },
  { name: 'Yellow', value: '#eab308', bgClass: 'bg-yellow-500', borderClass: 'border-yellow-500' },
  { name: 'Indigo', value: '#6366f1', bgClass: 'bg-indigo-500', borderClass: 'border-indigo-500' },
  { name: 'Teal', value: '#14b8a6', bgClass: 'bg-teal-500', borderClass: 'border-teal-500' },
];

export const defaultStockStatusColors: StockStatusColors = {
  orderedColor: '#3b82f6', // blue
  receivedColor: '#22c55e', // green
};

export const colorThemes: Record<ColorTheme, { name: string; hue: number; saturation: number; lightness: number; preview: string }> = {
  purple: { name: 'Deep Purple', hue: 270, saturation: 76, lightness: 52, preview: 'hsl(270 76% 52%)' },
  green: { name: 'Emerald', hue: 152, saturation: 69, lightness: 42, preview: 'hsl(152 69% 42%)' },
  blue: { name: 'Ocean Blue', hue: 217, saturation: 91, lightness: 60, preview: 'hsl(217 91% 60%)' },
  rose: { name: 'Rose', hue: 346, saturation: 77, lightness: 50, preview: 'hsl(346 77% 50%)' },
  orange: { name: 'Sunset Orange', hue: 24, saturation: 95, lightness: 53, preview: 'hsl(24 95% 53%)' },
  teal: { name: 'Teal', hue: 174, saturation: 72, lightness: 40, preview: 'hsl(174 72% 40%)' },
  red: { name: 'Crimson Red', hue: 0, saturation: 84, lightness: 50, preview: 'hsl(0 84% 50%)' },
  black: { name: 'Noir', hue: 0, saturation: 0, lightness: 20, preview: 'hsl(0 0% 20%)' },
  navy: { name: 'Midnight Navy', hue: 222, saturation: 72, lightness: 42, preview: 'hsl(222 72% 42%)' },
  gold: { name: 'Executive Gold', hue: 42, saturation: 88, lightness: 48, preview: 'hsl(42 88% 48%)' },
  cyan: { name: 'Electric Cyan', hue: 190, saturation: 88, lightness: 44, preview: 'hsl(190 88% 44%)' },
  magenta: { name: 'Magenta', hue: 316, saturation: 78, lightness: 50, preview: 'hsl(316 78% 50%)' },
};

export const colorfulPresets: Record<ColorfulPreset, { name: string; colors: [string, string, string, string]; textColors: [string, string, string, string] }> = {
  default: { 
    name: 'Default', 
    colors: ['bg-amber-600', 'bg-sky-600', 'bg-violet-600', 'bg-emerald-600'],
    textColors: ['text-amber-50', 'text-sky-50', 'text-violet-50', 'text-emerald-50']
  },
  sunset: { 
    name: 'Sunset', 
    colors: ['bg-orange-500', 'bg-rose-500', 'bg-pink-500', 'bg-red-500'],
    textColors: ['text-orange-50', 'text-rose-50', 'text-pink-50', 'text-red-50']
  },
  ocean: { 
    name: 'Ocean', 
    colors: ['bg-cyan-600', 'bg-blue-600', 'bg-indigo-600', 'bg-teal-600'],
    textColors: ['text-cyan-50', 'text-blue-50', 'text-indigo-50', 'text-teal-50']
  },
  forest: { 
    name: 'Forest', 
    colors: ['bg-lime-600', 'bg-green-600', 'bg-emerald-600', 'bg-teal-700'],
    textColors: ['text-lime-50', 'text-green-50', 'text-emerald-50', 'text-teal-50']
  },
  berry: { 
    name: 'Berry', 
    colors: ['bg-fuchsia-600', 'bg-purple-600', 'bg-violet-600', 'bg-pink-600'],
    textColors: ['text-fuchsia-50', 'text-purple-50', 'text-violet-50', 'text-pink-50']
  },
  earth: { 
    name: 'Earth', 
    colors: ['bg-amber-700', 'bg-orange-700', 'bg-stone-600', 'bg-yellow-700'],
    textColors: ['text-amber-50', 'text-orange-50', 'text-stone-50', 'text-yellow-50']
  },
  neon: { 
    name: 'Neon', 
    colors: ['bg-lime-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-yellow-500'],
    textColors: ['text-lime-950', 'text-cyan-950', 'text-fuchsia-50', 'text-yellow-950']
  },
  pastel: { 
    name: 'Pastel', 
    colors: ['bg-pink-400', 'bg-sky-400', 'bg-violet-400', 'bg-lime-400'],
    textColors: ['text-pink-950', 'text-sky-950', 'text-violet-950', 'text-lime-950']
  },
  mono: { 
    name: 'Monochrome', 
    colors: ['bg-slate-500', 'bg-slate-600', 'bg-slate-700', 'bg-slate-800'],
    textColors: ['text-slate-50', 'text-slate-50', 'text-slate-50', 'text-slate-50']
  },
  candy: { 
    name: 'Candy', 
    colors: ['bg-rose-400', 'bg-orange-400', 'bg-teal-400', 'bg-indigo-400'],
    textColors: ['text-rose-950', 'text-orange-950', 'text-teal-950', 'text-indigo-50']
  },
};

export const boardSingleColors: Record<BoardSingleColor, { name: string; bgClass: string; textClass: string; preview: string }> = {
  amber: { name: 'Amber', bgClass: 'bg-amber-600', textClass: 'text-amber-50', preview: 'hsl(45 93% 47%)' },
  sky: { name: 'Sky Blue', bgClass: 'bg-sky-600', textClass: 'text-sky-50', preview: 'hsl(200 98% 39%)' },
  violet: { name: 'Violet', bgClass: 'bg-violet-600', textClass: 'text-violet-50', preview: 'hsl(262 83% 58%)' },
  emerald: { name: 'Emerald', bgClass: 'bg-emerald-600', textClass: 'text-emerald-50', preview: 'hsl(160 84% 39%)' },
  slate: { name: 'Slate', bgClass: 'bg-slate-600', textClass: 'text-slate-50', preview: 'hsl(215 14% 34%)' },
  rose: { name: 'Rose', bgClass: 'bg-rose-600', textClass: 'text-rose-50', preview: 'hsl(350 89% 60%)' },
  cyan: { name: 'Cyan', bgClass: 'bg-cyan-600', textClass: 'text-cyan-50', preview: 'hsl(185 94% 40%)' },
  lime: { name: 'Lime', bgClass: 'bg-lime-600', textClass: 'text-lime-50', preview: 'hsl(85 85% 35%)' },
  orange: { name: 'Orange', bgClass: 'bg-orange-600', textClass: 'text-orange-50', preview: 'hsl(25 95% 53%)' },
  indigo: { name: 'Indigo', bgClass: 'bg-indigo-600', textClass: 'text-indigo-50', preview: 'hsl(239 84% 67%)' },
  pink: { name: 'Pink', bgClass: 'bg-pink-600', textClass: 'text-pink-50', preview: 'hsl(330 81% 60%)' },
  primary: { name: 'Theme Color', bgClass: 'bg-primary', textClass: 'text-primary-foreground', preview: 'var(--primary)' },
  custom: { name: 'Custom', bgClass: '', textClass: 'text-white', preview: '#6366f1' },
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'alephThemePreferencesV2';

interface StoredThemePreferences {
  theme: Theme;
  colorTheme: ColorTheme;
  boardColorMode: BoardColorMode;
  boardSingleColor: BoardSingleColor;
  colorfulPreset: ColorfulPreset;
  customBoardColor: string;
  stockStatusColors: StockStatusColors;
  uiVariant: UiVariant;
  toolbarStyle: ToolbarStyle;
  surfaceStyle: SurfaceStyle;
  canvasStyle: CanvasStyle;
}

const defaultPreferences: StoredThemePreferences = {
  theme: 'light',
  colorTheme: 'black',
  boardColorMode: 'colorful',
  boardSingleColor: 'primary',
  colorfulPreset: 'default',
  customBoardColor: '#6366f1',
  stockStatusColors: defaultStockStatusColors,
  uiVariant: 'standard',
  toolbarStyle: 'classic',
  surfaceStyle: 'soft',
  canvasStyle: 'aurora',
};

const readStoredPreferences = (): StoredThemePreferences => {
  if (typeof window === 'undefined') return defaultPreferences;

  try {
    const consolidated = localStorage.getItem(STORAGE_KEY);
    if (consolidated) {
      const parsed = JSON.parse(consolidated) as Partial<StoredThemePreferences>;
      return {
        theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'auto' ? parsed.theme : defaultPreferences.theme,
        colorTheme: parsed.colorTheme && colorThemes[parsed.colorTheme] ? parsed.colorTheme : defaultPreferences.colorTheme,
        boardColorMode: parsed.boardColorMode === 'single' || parsed.boardColorMode === 'colorful' ? parsed.boardColorMode : defaultPreferences.boardColorMode,
        boardSingleColor: parsed.boardSingleColor && boardSingleColors[parsed.boardSingleColor] ? parsed.boardSingleColor : defaultPreferences.boardSingleColor,
        colorfulPreset: parsed.colorfulPreset && colorfulPresets[parsed.colorfulPreset] ? parsed.colorfulPreset : defaultPreferences.colorfulPreset,
        customBoardColor: typeof parsed.customBoardColor === 'string' ? parsed.customBoardColor : defaultPreferences.customBoardColor,
        stockStatusColors: parsed.stockStatusColors?.orderedColor && parsed.stockStatusColors?.receivedColor ? parsed.stockStatusColors : defaultPreferences.stockStatusColors,
        uiVariant: parsed.uiVariant === 'glass' ? 'glass' : 'standard',
        toolbarStyle: ['classic', 'dark', 'logo-wall', 'midnight', 'glass'].includes(parsed.toolbarStyle || '') ? parsed.toolbarStyle as ToolbarStyle : defaultPreferences.toolbarStyle,
        surfaceStyle: ['clean', 'soft', 'glass', 'contrast'].includes(parsed.surfaceStyle || '') ? parsed.surfaceStyle as SurfaceStyle : defaultPreferences.surfaceStyle,
        canvasStyle: ['aurora', 'clean', 'mesh', 'midnight'].includes(parsed.canvasStyle || '') ? parsed.canvasStyle as CanvasStyle : defaultPreferences.canvasStyle,
      };
    }

    // Backward compatibility with the original individual localStorage keys.
    const legacyStock = localStorage.getItem('stockStatusColors');
    let stockStatusColors = defaultPreferences.stockStatusColors;
    if (legacyStock) {
      try {
        const parsed = JSON.parse(legacyStock);
        if (parsed?.orderedColor && parsed?.receivedColor) stockStatusColors = parsed;
      } catch {}
    }

    const legacyTheme = localStorage.getItem('theme') as Theme | null;
    const legacyColor = localStorage.getItem('colorTheme') as ColorTheme | null;
    const legacyBoardMode = localStorage.getItem('boardColorMode') as BoardColorMode | null;
    const legacyBoardColor = localStorage.getItem('boardSingleColor') as BoardSingleColor | null;
    const legacyPreset = localStorage.getItem('colorfulPreset') as ColorfulPreset | null;
    const legacyUi = localStorage.getItem('uiVariant') as UiVariant | null;

    return {
      ...defaultPreferences,
      theme: legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'auto' ? legacyTheme : defaultPreferences.theme,
      colorTheme: legacyColor && colorThemes[legacyColor] ? legacyColor : defaultPreferences.colorTheme,
      boardColorMode: legacyBoardMode === 'single' || legacyBoardMode === 'colorful' ? legacyBoardMode : defaultPreferences.boardColorMode,
      boardSingleColor: legacyBoardColor && boardSingleColors[legacyBoardColor] ? legacyBoardColor : defaultPreferences.boardSingleColor,
      colorfulPreset: legacyPreset && colorfulPresets[legacyPreset] ? legacyPreset : defaultPreferences.colorfulPreset,
      customBoardColor: localStorage.getItem('customBoardColor') || defaultPreferences.customBoardColor,
      stockStatusColors,
      uiVariant: legacyUi === 'glass' ? 'glass' : 'standard',
    };
  } catch (error) {
    console.warn('Failed to read saved theme preferences:', error);
    return defaultPreferences;
  }
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Critical: preferences are loaded synchronously on the FIRST render.
  // This prevents default values from being persisted before saved values are restored.
  const [initialPreferences] = useState<StoredThemePreferences>(() => readStoredPreferences());
  const [theme, setTheme] = useState<Theme>(initialPreferences.theme);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(initialPreferences.colorTheme);
  const [boardColorMode, setBoardColorMode] = useState<BoardColorMode>(initialPreferences.boardColorMode);
  const [boardSingleColor, setBoardSingleColor] = useState<BoardSingleColor>(initialPreferences.boardSingleColor);
  const [colorfulPreset, setColorfulPreset] = useState<ColorfulPreset>(initialPreferences.colorfulPreset);
  const [customBoardColor, setCustomBoardColor] = useState(initialPreferences.customBoardColor);
  const [stockStatusColors, setStockStatusColors] = useState<StockStatusColors>(initialPreferences.stockStatusColors);
  const [uiVariant, setUiVariant] = useState<UiVariant>(initialPreferences.uiVariant);
  const [toolbarStyle, setToolbarStyle] = useState<ToolbarStyle>(initialPreferences.toolbarStyle);
  const [surfaceStyle, setSurfaceStyle] = useState<SurfaceStyle>(initialPreferences.surfaceStyle);
  const [canvasStyle, setCanvasStyle] = useState<CanvasStyle>(initialPreferences.canvasStyle);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === 'auto' ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);

    const themeConfig = colorThemes[colorTheme];
    root.style.setProperty('--primary', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);
    root.style.setProperty('--ring', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);
    root.style.setProperty('--accent', `${themeConfig.hue} ${themeConfig.saturation}% 95%`);
    root.style.setProperty('--accent-foreground', `${themeConfig.hue} ${themeConfig.saturation}% 30%`);
    root.style.setProperty('--sidebar-primary', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);
    root.style.setProperty('--sidebar-accent', `${themeConfig.hue} ${themeConfig.saturation}% 96%`);
    root.style.setProperty('--sidebar-accent-foreground', `${themeConfig.hue} ${themeConfig.saturation}% 30%`);
    root.style.setProperty('--sidebar-ring', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);

    root.classList.toggle('ui-glass', uiVariant === 'glass');
    ['classic', 'dark', 'logo-wall', 'midnight', 'glass'].forEach(value => root.classList.remove(`toolbar-${value}`));
    ['clean', 'soft', 'glass', 'contrast'].forEach(value => root.classList.remove(`surface-${value}`));
    ['aurora', 'clean', 'mesh', 'midnight'].forEach(value => root.classList.remove(`canvas-${value}`));
    root.classList.add(`toolbar-${toolbarStyle}`, `surface-${surfaceStyle}`, `canvas-${canvasStyle}`);
    root.dataset.toolbarStyle = toolbarStyle;
    root.dataset.surfaceStyle = surfaceStyle;
    root.dataset.canvasStyle = canvasStyle;

    const themeColor = toolbarStyle === 'dark' || toolbarStyle === 'logo-wall' || toolbarStyle === 'midnight'
      ? '#0b1220'
      : resolvedTheme === 'dark' ? '#0e1117' : '#fafafa';
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])') || document.querySelector('meta[name="theme-color"]');
    themeColorMeta?.setAttribute('content', themeColor);

    const appleStatusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    appleStatusBarMeta?.setAttribute('content', resolvedTheme === 'dark' || toolbarStyle !== 'classic' ? 'black-translucent' : 'default');

    const timeout = window.setTimeout(() => root.classList.remove('theme-transition'), 420);
    return () => window.clearTimeout(timeout);
  }, [resolvedTheme, colorTheme, uiVariant, toolbarStyle, surfaceStyle, canvasStyle]);

  useEffect(() => {
    const preferences: StoredThemePreferences = {
      theme,
      colorTheme,
      boardColorMode,
      boardSingleColor,
      colorfulPreset,
      customBoardColor,
      stockStatusColors,
      uiVariant,
      toolbarStyle,
      surfaceStyle,
      canvasStyle,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      // Keep the original keys updated for older components/builds.
      localStorage.setItem('theme', theme);
      localStorage.setItem('colorTheme', colorTheme);
      localStorage.setItem('boardColorMode', boardColorMode);
      localStorage.setItem('boardSingleColor', boardSingleColor);
      localStorage.setItem('colorfulPreset', colorfulPreset);
      localStorage.setItem('customBoardColor', customBoardColor);
      localStorage.setItem('stockStatusColors', JSON.stringify(stockStatusColors));
      localStorage.setItem('uiVariant', uiVariant);
      localStorage.setItem('toolbarStyle', toolbarStyle);
      localStorage.setItem('surfaceStyle', surfaceStyle);
      localStorage.setItem('canvasStyle', canvasStyle);
    } catch (error) {
      console.warn('Failed to save theme preferences:', error);
    }
  }, [theme, colorTheme, boardColorMode, boardSingleColor, colorfulPreset, customBoardColor, stockStatusColors, uiVariant, toolbarStyle, surfaceStyle, canvasStyle]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{
      theme,
      resolvedTheme,
      colorTheme,
      boardColorMode,
      boardSingleColor,
      colorfulPreset,
      customBoardColor,
      stockStatusColors,
      uiVariant,
      toolbarStyle,
      surfaceStyle,
      canvasStyle,
      setTheme,
      setColorTheme,
      setBoardColorMode,
      setBoardSingleColor,
      setColorfulPreset,
      setCustomBoardColor,
      setStockStatusColors,
      setUiVariant,
      setToolbarStyle,
      setSurfaceStyle,
      setCanvasStyle,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
