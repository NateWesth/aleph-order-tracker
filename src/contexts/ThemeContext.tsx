import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type ColorTheme = 'purple' | 'green' | 'blue' | 'rose' | 'orange' | 'teal' | 'red' | 'black';
type BoardColorMode = 'colorful' | 'single';
type BoardSingleColor = 'amber' | 'sky' | 'violet' | 'emerald' | 'slate' | 'rose' | 'cyan' | 'lime' | 'orange' | 'indigo' | 'pink' | 'primary' | 'custom';
type ColorfulPreset = 'default' | 'sunset' | 'ocean' | 'forest' | 'berry' | 'earth' | 'neon' | 'pastel' | 'mono' | 'candy';

export interface StockStatusColors {
  orderedColor: string;
  receivedColor: string;
}

interface ThemeContextType {
  theme: Theme;
  colorTheme: ColorTheme;
  boardColorMode: BoardColorMode;
  boardSingleColor: BoardSingleColor;
  colorfulPreset: ColorfulPreset;
  customBoardColor: string;
  stockStatusColors: StockStatusColors;
  setTheme: (theme: Theme) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
  setBoardColorMode: (mode: BoardColorMode) => void;
  setBoardSingleColor: (color: BoardSingleColor) => void;
  setColorfulPreset: (preset: ColorfulPreset) => void;
  setCustomBoardColor: (color: string) => void;
  setStockStatusColors: (colors: StockStatusColors) => void;
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

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('black');
  const [boardColorMode, setBoardColorMode] = useState<BoardColorMode>('colorful');
  const [boardSingleColor, setBoardSingleColor] = useState<BoardSingleColor>('primary');
  const [colorfulPreset, setColorfulPreset] = useState<ColorfulPreset>('default');
  const [customBoardColor, setCustomBoardColor] = useState<string>('#6366f1');
  const [stockStatusColors, setStockStatusColors] = useState<StockStatusColors>(defaultStockStatusColors);

  // Initialize theme from localStorage
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        setTheme(savedTheme);
      }
      const savedColorTheme = localStorage.getItem('colorTheme') as ColorTheme;
      if (savedColorTheme && colorThemes[savedColorTheme]) {
        setColorTheme(savedColorTheme);
      }
      const savedBoardMode = localStorage.getItem('boardColorMode') as BoardColorMode;
      if (savedBoardMode && (savedBoardMode === 'colorful' || savedBoardMode === 'single')) {
        setBoardColorMode(savedBoardMode);
      }
      const savedBoardColor = localStorage.getItem('boardSingleColor') as BoardSingleColor;
      if (savedBoardColor && boardSingleColors[savedBoardColor]) {
        setBoardSingleColor(savedBoardColor);
      }
      const savedColorfulPreset = localStorage.getItem('colorfulPreset') as ColorfulPreset;
      if (savedColorfulPreset && colorfulPresets[savedColorfulPreset]) {
        setColorfulPreset(savedColorfulPreset);
      }
      const savedCustomColor = localStorage.getItem('customBoardColor');
      if (savedCustomColor) {
        setCustomBoardColor(savedCustomColor);
      }
      const savedStockStatusColors = localStorage.getItem('stockStatusColors');
      if (savedStockStatusColors) {
        try {
          const parsed = JSON.parse(savedStockStatusColors);
          setStockStatusColors(parsed);
        } catch (e) {
          // Invalid JSON, use defaults
        }
      }
    } catch (error) {
      console.warn('Failed to read theme from localStorage:', error);
    }
  }, []);

  useEffect(() => {
    // Apply dark/light theme to document
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
    // Update theme-color meta tag to match status bar
    // Light theme = white background (dark status bar icons)
    // Dark theme = dark background (white status bar icons)
    const themeColor = theme === 'dark' ? '#141619' : '#fafafa';
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])') 
      || document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', themeColor);
    }
    
    // Update apple-mobile-web-app-status-bar-style
    const appleStatusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStatusBarMeta) {
      // 'default' = black text on white bg, 'black-translucent' = white text on dark bg
      appleStatusBarMeta.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
    }
    
    // Save theme preference
    try {
      localStorage.setItem('theme', theme);
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error);
    }
  }, [theme]);

  useEffect(() => {
    // Apply color theme CSS variables
    const root = window.document.documentElement;
    const themeConfig = colorThemes[colorTheme];
    
    // Light mode colors
    root.style.setProperty('--primary', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);
    root.style.setProperty('--ring', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);
    root.style.setProperty('--accent', `${themeConfig.hue} ${themeConfig.saturation}% 95%`);
    root.style.setProperty('--accent-foreground', `${themeConfig.hue} ${themeConfig.saturation}% 30%`);
    root.style.setProperty('--sidebar-primary', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);
    root.style.setProperty('--sidebar-accent', `${themeConfig.hue} ${themeConfig.saturation}% 96%`);
    root.style.setProperty('--sidebar-accent-foreground', `${themeConfig.hue} ${themeConfig.saturation}% 30%`);
    root.style.setProperty('--sidebar-ring', `${themeConfig.hue} ${themeConfig.saturation}% ${themeConfig.lightness}%`);

    // Save color theme preference
    try {
      localStorage.setItem('colorTheme', colorTheme);
    } catch (error) {
      console.warn('Failed to save color theme to localStorage:', error);
    }
  }, [colorTheme]);

  // Save board color preferences
  useEffect(() => {
    try {
      localStorage.setItem('boardColorMode', boardColorMode);
      localStorage.setItem('boardSingleColor', boardSingleColor);
      localStorage.setItem('colorfulPreset', colorfulPreset);
      localStorage.setItem('customBoardColor', customBoardColor);
      localStorage.setItem('stockStatusColors', JSON.stringify(stockStatusColors));
    } catch (error) {
      console.warn('Failed to save board color preferences:', error);
    }
  }, [boardColorMode, boardSingleColor, colorfulPreset, customBoardColor, stockStatusColors]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      colorTheme, 
      boardColorMode, 
      boardSingleColor,
      colorfulPreset,
      customBoardColor,
      stockStatusColors,
      setTheme, 
      setColorTheme, 
      setBoardColorMode, 
      setBoardSingleColor,
      setColorfulPreset,
      setCustomBoardColor,
      setStockStatusColors,
      toggleTheme 
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
