import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, Copy, Check, Mail, Clock, Users } from "lucide-react";
import { format } from "date-fns";

interface Company {
  id: string;
  name: string;
  code: string;
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
  company_id: string;
}

interface ClientInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ClientInviteDialog({ open, onOpenChange }: ClientInviteDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    const [companiesRes, invitationsRes] = await Promise.all([
      supabase.from("companies").select("id, name, code").order("name"),
      supabase
        .from("client_invitations")
        .select("id, email, status, created_at, expires_at, company_id")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setCompanies(companiesRes.data || []);
    setInvitations(invitationsRes.data || []);
    setLoading(false);
  };

  const handleSendInvite = async () => {
    if (!email || !companyId) {
      toast({ title: "Missing fields", description: "Please fill in both email and company.", variant: "destructive" });
      return;
    }
    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-client-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email, company_id: companyId }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to send invitation");
      }

      toast({
        title: "Invitation Sent!",
        description: `Invite sent to ${email}`,
      });

      setEmail("");
      setCompanyId("");
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const copyInviteLink = (invitationId: string) => {
    // Find the invitation and construct the link
    const invitation = invitations.find((i) => i.id === invitationId);
    if (!invitation) return;

    // We need the token, but we only have the id. For now, copy a message.
    const text = `You've been invited to the Aleph Orders client portal. Please check your email for the invitation link.`;
    navigator.clipboard.writeText(text);
    setCopiedId(invitationId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    if (new Date(expiresAt) < new Date() && status === "pending") {
      return <Badge variant="outline" className="text-destructive border-destructive/30">Expired</Badge>;
    }
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-amber-600 border-amber-300"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "accepted":
        return <Badge variant="outline" className="text-emerald-600 border-emerald-300"><Check className="h-3 w-3 mr-1" />Accepted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Client Portal Invitations
          </DialogTitle>
          <DialogDescription>
            Invite clients to access their orders through the portal
          </DialogDescription>
        </DialogHeader>

        {/* Send New Invite */}
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <h3 className="text-sm font-medium">Send New Invitation</h3>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Client Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="client@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select company..." />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSendInvite} disabled={sending} className="w-full">
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Invitation
              </>
            )}
          </Button>
        </div>

        {/* Recent Invitations */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Recent Invitations</h3>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No invitations sent yet</p>
          ) : (
            <div className="space-y-2">
              {invitations.map((inv) => {
                const company = companies.find((c) => c.id === inv.company_id);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{inv.email}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {company?.name || "Unknown"} · {format(new Date(inv.created_at), "dd MMM")}
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(inv.status, inv.expires_at)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
