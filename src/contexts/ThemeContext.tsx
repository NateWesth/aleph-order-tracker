import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type ColorTheme = 'purple' | 'green' | 'blue' | 'rose' | 'orange' | 'teal' | 'red' | 'black';

interface ThemeContextType {
  theme: Theme;
  colorTheme: ColorTheme;
  setTheme: (theme: Theme) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
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

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('purple');

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
    } catch (error) {
      console.warn('Failed to read theme from localStorage:', error);
    }
  }, []);

  useEffect(() => {
    // Apply dark/light theme to document
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
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

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, colorTheme, setTheme, setColorTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
