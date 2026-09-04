import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerUpLeft, Hash, Loader2, MessageCircle, Send, SmilePlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import EmojiPicker, { QUICK_REACTIONS } from "@/components/orders/components/EmojiPicker";

export interface CommentReference {
  id: string;
  reference: string;
  label: string;
}

interface FeedComment {
  id: string;
  entity_id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_id: string | null;
  author: string;
}

interface TeamMember { id: string; full_name: string | null; email: string | null }
interface ReactionRow { id: string; comment_id: string; user_id: string; emoji: string }

function relative(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function SharpeningCommentsPanel({ entityType, title, subtitle, references, onOpen }: {
  entityType: string;
  title: string;
  subtitle: string;
  references: CommentReference[];
  onOpen: (id: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [targetRef, setTargetRef] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [jobQuery, setJobQuery] = useState<string | null>(null);
  const [mentionedIds, setMentionedIds] = useState<Map<string, string>>(new Map());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refMap = useMemo(() => new Map(references.map((ref) => [ref.id, ref])), [references]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("entity_comments")
      .select("id, entity_id, user_id, body, created_at, reply_to_id")
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) { setLoading(false); return; }
    const rows = (data || []) as any[];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] as any[] };
    const authorMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || p.email || "Team member"]));
    setComments(rows.map((r) => ({
      id: r.id, entity_id: r.entity_id, user_id: r.user_id, body: r.body,
      created_at: r.created_at, reply_to_id: r.reply_to_id,
      author: authorMap.get(r.user_id) || "Team member",
    })));
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: reactionRows } = await supabase
        .from("entity_comment_reactions").select("id, comment_id, user_id, emoji").in("comment_id", ids);
      setReactions((reactionRows || []) as ReactionRow[]);
    } else setReactions([]);
    setLoading(false);
  }, [entityType]);

  useEffect(() => {
    void load();
    void supabase.from("profiles").select("id, full_name, email").order("full_name", { ascending: true })
      .then(({ data }) => setTeam((data || []) as TeamMember[]));
    const channel = supabase
      .channel(`workshop-comment-feed-${entityType}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entity_comments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "entity_comment_reactions" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const commentById = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return team.filter((m) => (m.full_name || m.email || "").toLowerCase().includes(q)).slice(0, 5);
  }, [mentionQuery, team]);

  const jobSuggestions = useMemo(() => {
    if (jobQuery === null) return [];
    const q = jobQuery.toLowerCase();
    return references.filter((r) => `${r.reference} ${r.label}`.toLowerCase().includes(q)).slice(0, 5);
  }, [jobQuery, references]);

  const handleBodyChange = (value: string) => {
    setBody(value);
    const mention = value.match(/@([a-zA-Z0-9 ]{0,30})$/);
    setMentionQuery(mention ? mention[1] : null);
    const job = value.match(/#([a-zA-Z0-9\-/ ]{0,30})$/);
    setJobQuery(job ? job[1] : null);
  };

  const selectMention = (member: TeamMember) => {
    const name = member.full_name || member.email || "Team member";
    setBody((prev) => prev.replace(/@([a-zA-Z0-9 ]{0,30})$/, `@${name} `));
    setMentionedIds((prev) => new Map(prev).set(name, member.id));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const selectJob = (ref: CommentReference) => {
    setBody((prev) => prev.replace(/#([a-zA-Z0-9\-/ ]{0,30})$/, `#${ref.reference} `));
    setTargetRef((prev) => prev ?? ref.id);
    setJobQuery(null);
    inputRef.current?.focus();
  };

  const reactionSummary = (commentId: string) => {
    const byEmoji = new Map<string, string[]>();
    reactions.filter((r) => r.comment_id === commentId)
      .forEach((r) => byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) || []), r.user_id]));
    return [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, count: userIds.length, mine: !!user && userIds.includes(user.id) }));
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
      const { data, error } = await supabase.from("entity_comment_reactions")
        .insert({ comment_id: commentId, user_id: user.id, emoji }).select("id").maybeSingle();
      if (error) setReactions((prev) => prev.filter((r) => r.id !== tempId));
      else if (data?.id) setReactions((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: data.id } : r)));
    }
  };

  const activeJobId = replyTo?.entity_id || targetRef;

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed || !user?.id || sending) return;
    if (!activeJobId) {
      toast({ title: "Pick a job", description: "Choose the job this comment belongs to, or type # to reference one.", variant: "destructive" });
      return;
    }
    setSending(true);
    const mentionIds = [...mentionedIds.entries()].filter(([name]) => trimmed.includes(`@${name}`)).map(([, id]) => id);
    const { error } = await supabase.from("entity_comments").insert({
      entity_type: entityType,
      entity_id: activeJobId,
      user_id: user.id,
      body: trimmed,
      reply_to_id: replyTo?.id ?? null,
      mentioned_user_ids: mentionIds,
    });
    setSending(false);
    if (error) {
      toast({ title: "Comment not sent", description: "Check your connection and try again.", variant: "destructive" });
      return;
    }
    setBody(""); setReplyTo(null); setTargetRef(null); setMentionedIds(new Map());
    void load();
  };

  const renderBody = (text: string) => text.split(/(\s+)/).map((token, i) => {
    if (token.startsWith("@") || token.startsWith("#")) {
      return <span key={i} className="font-semibold text-logo-cyan">{token}</span>;
    }
    return <span key={i}>{token}</span>;
  });

  return (
    <section className="flex max-h-[360px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-logo-cyan/15 text-logo-cyan"><MessageCircle className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold">{title}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background/40 p-3">
        {loading && comments.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : comments.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No comments yet.</p>
        ) : comments.map((comment) => {
          const ref = refMap.get(comment.entity_id);
          const parent = comment.reply_to_id ? commentById.get(comment.reply_to_id) : null;
          const mine = comment.user_id === user?.id;
          const summary = reactionSummary(comment.id);
          return (
            <div key={comment.id} className="group rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(comment.entity_id)}
                  className="truncate rounded-md bg-logo-cyan/15 px-1.5 py-0.5 text-[10px] font-bold text-logo-cyan hover:bg-logo-cyan/25"
                >
                  {ref ? ref.reference : "Item"}
                </button>
                <span className="truncate text-xs font-semibold">{mine ? "You" : comment.author}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{relative(comment.created_at)}</span>
              </div>
              {parent && (
                <div className="mt-1.5 rounded-lg border-l-2 border-logo-cyan/40 bg-muted/40 px-2 py-1 text-[11px] opacity-80">
                  <div className="font-semibold">{parent.user_id === user?.id ? "You" : parent.author}</div>
                  <div className="line-clamp-2">{parent.body}</div>
                </div>
              )}
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90">{renderBody(comment.body)}</p>

              {summary.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {summary.map((s) => (
                    <button key={s.emoji} onClick={() => toggleReaction(comment.id, s.emoji)}
                      className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        s.mine ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:bg-muted/70")}>
                      <span>{s.emoji}</span><span className="font-medium">{s.count}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button onClick={() => { setReplyTo(comment); inputRef.current?.focus(); }} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
                  <CornerUpLeft className="h-3 w-3" />Reply
                </button>
                <EmojiPicker onSelect={(emoji) => toggleReaction(comment.id, emoji)}
                  trigger={<button className="text-muted-foreground hover:text-primary"><SmilePlus className="h-3 w-3" /></button>} />
                <div className="flex gap-1">
                  {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                    <button key={emoji} onClick={() => toggleReaction(comment.id, emoji)} className="text-sm transition-transform hover:scale-125">{emoji}</button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative border-t border-border">
        {mentionSuggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 z-10 mb-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {mentionSuggestions.map((member) => (
              <button key={member.id} onClick={() => selectMention(member)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {(member.full_name || member.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{member.full_name || member.email}</span>
              </button>
            ))}
          </div>
        )}
        {jobSuggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 z-10 mb-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {jobSuggestions.map((ref) => (
              <button key={ref.id} onClick={() => selectJob(ref)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-logo-cyan/10">
                <Hash className="h-3.5 w-3.5 shrink-0 text-logo-cyan" />
                <span className="truncate font-semibold">{ref.reference}</span>
                <span className="truncate text-xs text-muted-foreground">{ref.label}</span>
              </button>
            ))}
          </div>
        )}

        {(replyTo || targetRef) && (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
            <span className="min-w-0 truncate">
              {replyTo
                ? <><span className="font-semibold text-primary">Replying to {replyTo.user_id === user?.id ? "you" : replyTo.author}: </span><span className="text-muted-foreground">{replyTo.body}</span></>
                : <><span className="font-semibold text-logo-cyan">On job </span><span className="text-muted-foreground">{refMap.get(targetRef!)?.reference}</span></>}
            </span>
            <button onClick={() => { setReplyTo(null); setTargetRef(null); }} className="shrink-0 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
        )}

        <div className="flex items-end gap-2 p-2.5">
          <Textarea
            ref={inputRef}
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={activeJobId ? "Write a comment…" : "Type # to pick a job, @ to mention…"}
            rows={1}
            className="max-h-24 min-h-[38px] resize-none text-sm"
          />
          <Button size="sm" className="h-9 shrink-0" onClick={() => void send()} disabled={sending || !body.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </section>
  );
}
