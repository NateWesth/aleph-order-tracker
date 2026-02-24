import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tag, Plus, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface OrderTag {
  id: string;
  name: string;
  color: string;
}

interface OrderTagsProps {
  orderId: string;
  assignedTagIds: string[];
  allTags: OrderTag[];
  onTagsChanged: () => void;
  compact?: boolean;
}

export default function OrderTags({
  orderId,
  assignedTagIds,
  allTags,
  onTagsChanged,
  compact = false,
}: OrderTagsProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [creating, setCreating] = useState(false);

  const PRESET_COLORS = [
    "#ef4444", "#f59e0b", "#22c55e", "#3b82f6",
    "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
  ];

  const assignedTags = allTags.filter((t) => assignedTagIds.includes(t.id));

  const toggleTag = async (tagId: string) => {
    if (!user?.id) return;
    const isAssigned = assignedTagIds.includes(tagId);

    try {
      if (isAssigned) {
        await supabase
          .from("order_tag_assignments")
          .delete()
          .eq("order_id", orderId)
          .eq("tag_id", tagId);
      } else {
        await supabase.from("order_tag_assignments").insert([{
          order_id: orderId,
          tag_id: tagId,
          assigned_by: user.id,
        }]);
      }
      onTagsChanged();
    } catch (error) {
      console.error("Error toggling tag:", error);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim() || !user?.id) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("order_tags")
        .insert([{ name: newTagName.trim(), color: newTagColor, created_by: user.id }])
        .select("id")
        .single();

      if (error) throw error;

      // Auto-assign to this order
      if (data) {
        await supabase.from("order_tag_assignments").insert([{
          order_id: orderId,
          tag_id: data.id,
          assigned_by: user.id,
        }]);
      }

      setNewTagName("");
      onTagsChanged();
    } catch (error: any) {
      console.error("Error creating tag:", error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Display assigned tags */}
      {assignedTags.map((tag) => (
        <Badge
          key={tag.id}
          className="text-[9px] px-1.5 py-0 font-semibold border-0 cursor-default"
          style={{ backgroundColor: tag.color + "22", color: tag.color, borderColor: tag.color + "44" }}
        >
          {tag.name}
        </Badge>
      ))}

      {/* Tag picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center justify-center rounded-md transition-colors hover:bg-muted",
              compact ? "h-4 w-4" : "h-5 w-5"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Tag className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3", "text-muted-foreground")} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-2"
          align="start"
          side="bottom"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-medium text-muted-foreground mb-2">Manage Tags</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {allTags.map((tag) => {
              const isAssigned = assignedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0 border"
                    style={{ backgroundColor: tag.color, borderColor: tag.color }}
                  />
                  <span className="text-xs flex-1 truncate">{tag.name}</span>
                  {isAssigned && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Create new tag */}
          <div className="border-t border-border mt-2 pt-2 space-y-2">
            <div className="flex gap-1.5">
              <Input
                placeholder="New tag..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="h-7 text-xs"
                onKeyDown={(e) => e.key === "Enter" && createTag()}
              />
              <Button
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={!newTagName.trim() || creating}
                onClick={createTag}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-transform",
                    newTagColor === c ? "scale-125 border-foreground" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
