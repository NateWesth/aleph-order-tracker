import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Loader2, X, CornerUpLeft, SmilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import EmojiPicker, { QUICK_REACTIONS } from "@/components/orders/components/EmojiPicker";

interface EntityComment {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_id: string | null;
  author?: { full_name: string | null; email?: string | null } | null;
}

interface ReactionRow {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface EntityCommentsProps {
  entityType: "delivery" | "collection";
  entityId: string;
  orderId?: string | null;
  className?: string;
  defaultOpen?: boolean;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EntityComments({ entityType, entityId, orderId, className, defaultOpen = false }: EntityCommentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<EntityComment[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<EntityComment | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionedIds, setMentionedIds] = useState<Map<string, string>>(new Map());
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    void supabase
      .from("entity_comments")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .then(({ count: c, error }) => {
        if (active && !error) setCount(c || 0);
      });
    return () => { active = false; };
  }, [entityType, entityId]);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("entity_comments")
        .select("id, entity_type, entity_id, user_id, body, created_at, reply_to_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows = data || [];
      const userIds = [...new Set(rows.map((c) => c.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
        : { data: [] };
      const authorMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      setComments(rows.map((c) => ({ ...c, author: authorMap.get(c.user_id) || null })) as EntityComment[]);
      setCount(rows.length);

      const ids = rows.map((c) => c.id);
      if (ids.length) {
        const { data: reactionRows } = await supabase
          .from("entity_comment_reactions")
          .select("id, comment_id, user_id, emoji")
          .in("comment_id", ids);
        setReactions(reactionRows || []);
      } else {
        setReactions([]);
      }
    } catch (error) {
      console.error("Error loading entity comments:", error);
      toast({ title: "Comments could not load", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, toast]);

  useEffect(() => {
    if (!open) return;
    fetchThread();
    void supabase.from("profiles").select("id, full_name, email").order("full_name", { ascending: true })
      .then(({ data }) => setTeamMembers((data || []) as TeamMember[]));

    const channel = supabase
      .channel(`entity-comments-${entityType}-${entityId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entity_comments" }, (payload) => {
        const row = (payload.new || payload.old) as EntityComment;
        if (row?.entity_type === entityType && row?.entity_id === entityId) fetchThread();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "entity_comment_reactions" }, () => fetchThread())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, entityType, entityId, fetchThread]);

  const commentById = useMemo(() => {
    const map = new Map<string, EntityComment>();
    comments.forEach((c) => map.set(c.id, c));
    return map;
  }, [comments]);

  const nameFor = (c: EntityComment) => {
    if (c.user_id === user?.id) return "You";
    return c.author?.full_name || c.author?.email || "Team member";
  };

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return teamMembers.filter((m) => (m.full_name || m.email || "").toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, teamMembers]);

  const handleBodyChange = (value: string) => {
    setBody(value);
    const match = value.match(/@([a-zA-Z0-9 ]{0,30})$/);
    setMentionQuery(match ? match[1] : null);
  };

  const selectMention = (member: TeamMember) => {
    const name = member.full_name || member.email || "Team member";
    setBody((prev) => prev.replace(/@([a-zA-Z0-9 ]{0,30})$/, `@${name} `));
    setMentionedIds((prev) => new Map(prev).set(name, member.id));
    setMentionQuery(null);
  };

  const reactionSummary = (commentId: string) => {
    const forComment = reactions.filter((r) => r.comment_id === commentId);
    const byEmoji = new Map<string, string[]>();
    for (const r of forComment) byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) || []), r.user_id]);
    return [...byEmoji.entries()].map(([emoji, userIds]) => ({
      emoji, count: userIds.length, mine: !!user && userIds.includes(user.id),
    }));
  };

  const toggleReaction = async (commentId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find((r) => r.comment_id === commentId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      setReactions((prev) => prev.filter((r) => r.id !== existing.id));
      await supabase.from("entity_comment_reactions").delete().eq("id", existing.id);
    } else {
      const tempId = `optimistic-${Date.now()}`;
      setReactions((prev) => [...prev, { id: tempId, comment_id: commentId, user_id: user.id, emoji }]);
      const { data, error } = await supabase
        .from("entity_comment_reactions").insert({ comment_id: commentId, user_id: user.id, emoji })
        .select("id").maybeSingle();
      if (error) setReactions((prev) => prev.filter((r) => r.id !== tempId));
      else if (data?.id) setReactions((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: data.id } : r)));
    }
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || !user?.id || sending) return;
    setSending(true);

    const wasReplyingTo = replyTo;
    const mentionIdsToSend = [...mentionedIds.entries()].filter(([name]) => trimmed.includes(`@${name}`)).map(([, id]) => id);

    try {
      const { error } = await supabase.from("entity_comments").insert({
        entity_type: entityType,
        entity_id: entityId,
        order_id: orderId || null,
        user_id: user.id,
        body: trimmed,
        reply_to_id: wasReplyingTo?.id ?? null,
        mentioned_user_ids: mentionIdsToSend,
      });
      if (error) throw error;
      setBody("");
      setReplyTo(null);
      setMentionedIds(new Map());
      await fetchThread();
    } catch (error) {
      console.error("Error adding entity comment:", error);
      toast({ title: "Comment not sent", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={cn("rounded-2xl border border-border/60 bg-muted/10 overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageCircle className={cn("h-4 w-4", count > 0 && "text-blue-500")} />
          Comments
          {count > 0 && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-600">{count}</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-border/60">
          <div className="max-h-80 overflow-y-auto p-3.5 space-y-3 bg-background/40">
            {loading && comments.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : comments.length === 0 ? (
              <div className="rounded-xl bg-muted/40 px-3 py-5 text-center">
                <MessageCircle className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">No comments yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Add a note for the team.</p>
              </div>
            ) : (
              comments.map((comment) => {
                const mine = comment.user_id === user?.id;
                const parent = comment.reply_to_id ? commentById.get(comment.reply_to_id) : null;
                const summary = reactionSummary(comment.id);
                return (
                  <div key={comment.id} className={cn("group flex flex-col", mine ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm break-words shadow-sm bg-white dark:bg-card border",
                      mine ? "border-primary/30 rounded-tr-sm" : "border-border text-foreground rounded-tl-sm"
                    )}>
                      <div className={cn("text-[11px] font-semibold mb-0.5", mine ? "text-primary" : "text-primary/90")}>
                        {nameFor(comment)}
                      </div>
                      {parent && (
                        <div className="mb-1.5 rounded-lg border-l-2 border-primary/40 bg-primary/5 px-2 py-1 text-xs opacity-80">
                          <div className="font-semibold">{nameFor(parent)}</div>
                          <div className="line-clamp-2">{parent.body}</div>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-foreground">{comment.body}</p>
                    </div>

                    {summary.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {summary.map((s) => (
                          <button
                            key={s.emoji}
                            onClick={() => toggleReaction(comment.id, s.emoji)}
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                              s.mine ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                            )}
                          >
                            <span>{s.emoji}</span><span className="font-medium">{s.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <span className="text-[10px] text-muted-foreground">{formatTime(comment.created_at)}</span>
                      <button onClick={() => setReplyTo(comment)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
                        <CornerUpLeft className="h-3 w-3" />Reply
                      </button>
                      <EmojiPicker
                        onSelect={(emoji) => toggleReaction(comment.id, emoji)}
                        trigger={<button className="text-muted-foreground hover:text-primary"><SmilePlus className="h-3 w-3" /></button>}
                      />
                      <div className="flex gap-1">
                        {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                          <button key={emoji} onClick={() => toggleReaction(comment.id, emoji)} className="text-sm hover:scale-125 transition-transform">
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border/60 relative">
            {mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-1 rounded-xl border border-border bg-popover shadow-lg overflow-hidden z-10">
                {mentionSuggestions.map((member) => (
                  <button key={member.id} onClick={() => selectMention(member)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
                      {(member.full_name || member.email || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{member.full_name || member.email}</span>
                  </button>
                ))}
              </div>
            )}
            {replyTo && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-primary/5 border-b border-border/60">
                <div className="min-w-0 text-xs">
                  <span className="font-semibold text-primary">Replying to {nameFor(replyTo)}: </span>
                  <span className="text-muted-foreground line-clamp-1">{replyTo.body}</span>
                </div>
                <button onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </div>
            )}
            <div className="p-3">
              <div className="flex items-end gap-2">
                <EmojiPicker
                  onSelect={(emoji) => setBody((prev) => prev + emoji)}
                  trigger={<Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground"><SmilePlus className="h-4 w-4" /></Button>}
                />
                <Textarea
                  value={body}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSend(); }
                    if (e.key === "Escape") setMentionQuery(null);
                  }}
                  placeholder={replyTo ? "Reply..." : "Add a comment... (@ to mention someone)"}
                  className="min-h-[60px] resize-none rounded-xl text-sm"
                  maxLength={1000}
                  disabled={!user || sending}
                />
                <Button type="button" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={handleSend} disabled={!body.trim() || !user || sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">Ctrl/Cmd + Enter to send</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
