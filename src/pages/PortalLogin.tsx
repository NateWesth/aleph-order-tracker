import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function PortalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      navigate("/portal", { replace: true });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-[0.14] blur-3xl ribbon-gradient"
      />
      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <img
            src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
            alt="Aleph Engineering & Supplies"
            className="h-16 w-16 mx-auto mb-2"
          />
          <h1 className="font-display text-4xl font-extrabold text-foreground">Aleph Orders</h1>
          <p className="text-sm tracking-widest uppercase font-semibold text-muted-foreground">Client Portal</p>
        </div>

        <Card className="shadow-bold-lg border-primary/20 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-blue via-brand-magenta to-brand-orange" aria-hidden />
          <CardHeader className="px-8 pt-8 pb-6">
            <CardTitle className="text-3xl font-extrabold mb-1">Sign in</CardTitle>
            <CardDescription className="text-base">Access your orders and track their progress</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-base font-semibold">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-base font-semibold">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 text-base"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Don't have an account? Ask your supplier for an invitation.
        </p>
      </div>
    </div>
  );
}
