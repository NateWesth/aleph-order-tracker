import { readAllRows } from "./readAllRows";

type Reader = { from: (table: string) => any };
export interface SavedEntityComment {
  id: string; entity_type: string; entity_id: string; user_id: string;
  body: string; created_at: string; reply_to_id: string | null;
}
export interface CommentMember { id: string; full_name: string | null; email: string | null }
export interface SavedCommentReaction { id: string; comment_id: string; user_id: string; emoji: string }

/** Both workshop surfaces read the same saved comments, authors and reactions. */
export async function readEntityCommentData(db: Reader, entityType: string, entityId?: string, recentLimit?: number) {
  const comments = await readAllRows<SavedEntityComment>((from, to) => {
    let query = db.from("entity_comments").select("id,entity_type,entity_id,user_id,body,created_at,reply_to_id").eq("entity_type", entityType);
    if (entityId) query = query.eq("entity_id", entityId);
    return query.order("created_at", { ascending: !!entityId }).order("id").range(from, recentLimit ? Math.min(to, recentLimit - 1) : to);
  });
  const [members, reactions] = await Promise.all([
    readAllRows<CommentMember>((from, to) => db.from("profiles").select("id,full_name,email").order("full_name").order("id").range(from, to)),
    readReactions(db, comments.map(comment => comment.id)),
  ]);
  return { comments, members, reactions };
}

async function readReactions(db: Reader, ids: string[]) {
  const reactions: SavedCommentReaction[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    reactions.push(...await readAllRows<SavedCommentReaction>((from, to) => db.from("entity_comment_reactions").select("id,comment_id,user_id,emoji").in("comment_id", batch).order("id").range(from, to)));
  }
  return reactions;
}