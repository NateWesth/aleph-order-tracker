import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		fontSize: {
			xs: ['0.75rem', { lineHeight: '1rem' }],
			sm: ['0.875rem', { lineHeight: '1.25rem' }],
			base: ['1rem', { lineHeight: '1.5rem' }],
			lg: ['1.125rem', { lineHeight: '1.75rem' }],
			xl: ['1.25rem', { lineHeight: '1.75rem' }],
			'2xl': ['1.5rem', { lineHeight: '2rem' }],
			'3xl': ['1.875rem', { lineHeight: '2.25rem' }],
			'4xl': ['2.25rem', { lineHeight: '2.5rem' }],
			'5xl': ['3rem', { lineHeight: '1' }],
			'6xl': ['3.75rem', { lineHeight: '1' }],
		},
		fontWeight: {
			light: '300',
			normal: '400',
			medium: '500',
			semibold: '600',
			bold: '700',
			extrabold: '800',
		},
		container: {
			center: true,
			padding: {
				DEFAULT: '1rem',
				sm: '1.5rem',
				lg: '2rem',
				xl: '2.5rem',
			},
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
				display: ['Space Grotesk', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
				mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					light: 'hsl(205 90% 65%)',
					dark: 'hsl(205 90% 32%)',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Brand colors - Bold vibrant palette
				brand: {
					blue: 'hsl(205 95% 45%)',
					green: 'hsl(142 70% 38%)',
					magenta: 'hsl(330 85% 58%)',
					orange: 'hsl(28 95% 52%)',
					purple: 'hsl(262 80% 55%)',
					teal: 'hsl(178 70% 40%)',
				},
				status: {
					success: 'hsl(152 70% 35%)',
					warning: 'hsl(32 95% 48%)',
					error: 'hsl(355 85% 50%)',
					info: 'hsl(205 90% 45%)',
				},
				// Legacy color tokens - aligned to the ribbon palette sampled from the real Aleph logo
				company: {
					green: 'hsl(142 60% 40%)',
					darkgreen: 'hsl(142 60% 34%)',
					gray: 'hsl(215 16% 47%)',
					lightgray: 'hsl(210 40% 96%)',
					accent: 'hsl(205 90% 42%)',
					magenta: 'hsl(330 82% 55%)',
					orange: 'hsl(28 90% 54%)',
					blue: 'hsl(205 90% 42%)',
					darkblue: 'hsl(205 90% 32%)',
				},
				aleph: {
					blue: 'hsl(205 90% 42%)',
					green: 'hsl(142 60% 40%)',
					magenta: 'hsl(330 82% 55%)',
					accent: 'hsl(205 90% 42%)',
					orange: 'hsl(28 90% 54%)',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				xl: 'calc(var(--radius) + 4px)',
				'2xl': 'calc(var(--radius) + 8px)',
				'3xl': 'calc(var(--radius) + 12px)',
			},
			spacing: {
				xs: '0.25rem',
				sm: '0.5rem',
				md: '1rem',
				lg: '1.5rem',
				xl: '2rem',
				'2xl': '2.5rem',
				'3xl': '3rem',
				'13': '3.25rem',
			},
			boxShadow: {
				'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
				'soft': '0 2px 8px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
				'soft-lg': '0 4px 12px -2px rgb(0 0 0 / 0.1), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
				'soft-xl': '0 8px 24px -4px rgb(0 0 0 / 0.12), 0 4px 8px -2px rgb(0 0 0 / 0.08)',
				'bold': '0 4px 16px -2px rgb(0 0 0 / 0.15), 0 2px 8px -2px rgb(0 0 0 / 0.1)',
				'bold-lg': '0 8px 24px -4px rgb(0 0 0 / 0.2), 0 4px 12px -2px rgb(0 0 0 / 0.15)',
				'glow': '0 0 20px -5px hsl(var(--primary) / 0.3)',
				'glow-sm': '0 0 10px -3px hsl(var(--primary) / 0.25)',
				'glow-lg': '0 0 30px -5px hsl(var(--primary) / 0.4)',
				'glow-xl': '0 0 40px -8px hsl(var(--primary) / 0.5)',
				'neon': '0 0 5px hsl(var(--primary) / 0.3), 0 0 20px hsl(var(--primary) / 0.15), 0 0 40px hsl(var(--primary) / 0.05)',
				'button-base': '0 2px 8px -1px rgb(0 0 0 / 0.1), 0 1px 3px -1px rgb(0 0 0 / 0.06)',
				'button-hover': '0 4px 12px -2px rgb(0 0 0 / 0.15), 0 2px 6px -1px rgb(0 0 0 / 0.1)',
				'button-active': '0 2px 4px -1px rgb(0 0 0 / 0.08)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'fade-in': {
					'0%': { opacity: '0', transform: 'translateY(8px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				},
				'fade-out': {
					'0%': { opacity: '1', transform: 'translateY(0)' },
					'100%': { opacity: '0', transform: 'translateY(8px)' }
				},
				'slide-in': {
					'0%': { opacity: '0', transform: 'translateX(-8px)' },
					'100%': { opacity: '1', transform: 'translateX(0)' }
				},
				'scale-in': {
					'0%': { opacity: '0', transform: 'scale(0.96)' },
					'100%': { opacity: '1', transform: 'scale(1)' }
				},
				'order-floating-bubble': {
					'0%': { opacity: '0', transform: 'translateY(14px) scale(0.97)' },
					'100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
				},
				'order-floating-bubble-content': {
					'0%': { opacity: '0', transform: 'translateY(4px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				},
				'shimmer': {
					'0%': { backgroundPosition: '-200% 0' },
					'100%': { backgroundPosition: '200% 0' }
				},
				'glow-pulse': {
					'0%, 100%': { boxShadow: '0 0 5px hsl(var(--primary) / 0.2), 0 0 15px hsl(var(--primary) / 0.1)' },
					'50%': { boxShadow: '0 0 10px hsl(var(--primary) / 0.35), 0 0 30px hsl(var(--primary) / 0.15)' }
				},
				'page-enter': {
					'0%': { opacity: '0', transform: 'translateY(8px) scale(0.995)' },
					'100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
				},
				'page-enter-smooth': {
					'0%': { opacity: '0', transform: 'translateY(12px) scale(0.99)' },
					'40%': { opacity: '0.6', transform: 'translateY(4px) scale(0.997)' },
					'100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
				},
				'aurora-1': {
					'0%, 100%': { transform: 'translate(0%, 0%) scale(1)' },
					'33%': { transform: 'translate(15%, 10%) scale(1.1)' },
					'66%': { transform: 'translate(-10%, 15%) scale(0.95)' }
				},
				'aurora-2': {
					'0%, 100%': { transform: 'translate(0%, 0%) scale(1)' },
					'33%': { transform: 'translate(-12%, -8%) scale(1.05)' },
					'66%': { transform: 'translate(10%, -12%) scale(1.1)' }
				},
				'aurora-3': {
					'0%, 100%': { transform: 'translate(-50%, 0%) scale(1)' },
					'33%': { transform: 'translate(-40%, 8%) scale(1.15)' },
					'66%': { transform: 'translate(-60%, -5%) scale(0.9)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.3s ease-out forwards',
				'fade-out': 'fade-out 0.3s ease-out forwards',
				'slide-in': 'slide-in 0.3s ease-out forwards',
				'scale-in': 'scale-in 0.2s ease-out forwards',
				'order-floating-bubble': 'order-floating-bubble 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
				'order-floating-bubble-content': 'order-floating-bubble-content 0.22s ease-out forwards',
				'shimmer': 'shimmer 2s linear infinite',
				'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
				'page-enter': 'page-enter 0.3s ease-out forwards',
				'page-enter-smooth': 'page-enter-smooth 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
				'aurora-1': 'aurora-1 20s ease-in-out infinite',
				'aurora-2': 'aurora-2 25s ease-in-out infinite',
				'aurora-3': 'aurora-3 22s ease-in-out infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
