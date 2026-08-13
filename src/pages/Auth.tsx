
import { useState } from "react";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10 relative overflow-hidden">
      {/* Ambient brand glow - bold and vibrant */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.15] blur-3xl ribbon-gradient"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.08] blur-3xl bg-brand-magenta"
      />

      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full hover:bg-primary/10"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-6 w-6 text-muted-foreground" />
          ) : (
            <Moon className="h-6 w-6 text-muted-foreground" />
          )}
        </Button>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand mark - Enhanced */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-2xl" />
            <img
              src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
              alt="Aleph Engineering & Supplies"
              className="h-16 w-16 relative"
            />
          </div>
          <div className="text-center">
            <h1 className="font-display text-4xl md:text-5xl font-extrabold text-foreground leading-tight">Aleph</h1>
            <p className="text-sm md:text-base tracking-widest text-muted-foreground uppercase font-semibold mt-2">Engineering &amp; Supplies</p>
          </div>
        </div>

        <Card className="shadow-bold-lg border-primary/20 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-blue via-brand-magenta to-brand-orange" aria-hidden />
          <CardHeader className="text-center px-8 pt-8 pb-6">
            <CardTitle className="text-3xl md:text-4xl font-extrabold mb-2">
              {isLogin ? "Welcome Back" : "Create Account"}
            </CardTitle>
            <CardDescription className="text-base md:text-lg text-muted-foreground">
              {isLogin
                ? "Access your order management dashboard"
                : "Join our platform today"}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {isLogin ? <LoginForm /> : <RegisterForm />}

            <div className="mt-8 text-center border-t border-border/40 pt-8">
              <p className="text-base text-muted-foreground mb-4">
                {isLogin ? "New here?" : "Already have an account?"}
              </p>
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold text-primary hover:bg-primary/10 transition-all duration-200"
              >
                {isLogin ? "Create an Account" : "Sign In"}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Looking for the client portal?{" "}
          <a href="/portal/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
            Access it here
          </a>
        </p>
      </div>
    </div>
  );
};

export default Auth;
