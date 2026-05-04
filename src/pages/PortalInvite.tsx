import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package, CheckCircle, XCircle } from "lucide-react";

interface InvitationInfo {
  email: string;
  companyName: string;
  companyCode: string;
  companyId: string;
}

export default function PortalInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    verifyInvitation();
  }, [token]);

  const verifyInvitation = async () => {
    try {
      const { data, error } = await supabase
        .rpc("get_invitation_by_token", { _token: token! });

      const invite = Array.isArray(data) ? data[0] : data;

      if (error || !invite) {
        setExpired(true);
        setLoading(false);
        return;
      }

      if (invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }

      setInvitation({
        email: invite.email,
        companyName: invite.company_name,
        companyCode: invite.company_code,
        companyId: invite.company_id,
      });
    } catch (err) {
      console.error("Error verifying invitation:", err);
      setExpired(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    setSubmitting(true);

    try {
      // Register the user with Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone,
            company_code: invitation.companyCode,
          },
        },
      });

      if (signUpError) {
        toast({
          title: "Registration Failed",
          description: signUpError.message,
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // Mark invitation as accepted (use service role via the token - RLS allows public read)
      // The admin can see updated status
      if (authData.user) {
        // Update invitation status - we need to do this via an edge function or RPC
        // For now, the admin can check the user's profile
        console.log("User registered successfully:", authData.user.id);
      }

      toast({
        title: "Account Created!",
        description: "Please check your email to confirm your account, then sign in.",
      });

      // Navigate to portal login
      setTimeout(() => navigate("/portal/login", { replace: true }), 2000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!token || expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Invalid or Expired Invitation</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This invitation link is no longer valid. Please ask your supplier for a new one.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => navigate("/portal/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Package className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Aleph Orders</h1>
          <p className="text-sm text-muted-foreground">Client Portal</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Create Your Account</CardTitle>
            <CardDescription>
              You've been invited to join <strong>{invitation?.companyName}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={invitation?.email || ""} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="Your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  placeholder="+27..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
