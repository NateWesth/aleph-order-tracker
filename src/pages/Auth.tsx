
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10 relative overflow-hidden">
      {/* Ambient brand glow - subtle, sampled from the ribbon, not a generic blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full opacity-[0.10] blur-3xl ribbon-gradient"
      />

      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Moon className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand mark */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <img
            src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
            alt="Aleph Engineering & Supplies"
            className="h-14 w-14"
          />
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-foreground leading-tight">Aleph</h1>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Engineering &amp; Supplies</p>
          </div>
        </div>

        <Card className="shadow-soft-lg border-border/60 overflow-hidden">
          <div className="ribbon-bar" aria-hidden />
          <CardHeader className="text-center px-6 pt-6">
            <CardTitle className="text-xl md:text-2xl font-bold">
              {isLogin ? "Welcome back" : "Create an account"}
            </CardTitle>
            <CardDescription className="text-sm md:text-base">
              {isLogin
                ? "Sign in to track and manage your orders"
                : "Fill in your details to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {isLogin ? <LoginForm /> : <RegisterForm />}

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="ml-1 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                >
                  {isLogin ? "Register now" : "Login now"}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Looking for the client portal?{" "}
          <a href="/portal/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Sign in here
          </a>
        </p>
      </div>
    </div>
  );
};

export default Auth;
