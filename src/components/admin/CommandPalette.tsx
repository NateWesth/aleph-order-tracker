import { useState, useEffect, useCallback } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Package, History, Building2, Truck, FileText, Box, Users, BarChart3, Settings, Home, Search, LogOut, Mic } from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string) => void;
  onAction: (action: string) => void;
  isAdmin: boolean;
}

const NAVIGATION_ITEMS = [
  { id: "home", label: "Home Dashboard", icon: Home, keywords: "home dashboard welcome" },
  { id: "orders", label: "Orders Board", icon: Package, keywords: "orders board kanban active" },
  { id: "history", label: "Order History", icon: History, keywords: "history completed delivered past" },
  { id: "clients", label: "Clients", icon: Building2, keywords: "clients companies customers" },
  { id: "suppliers", label: "Suppliers", icon: Truck, keywords: "suppliers vendors" },
  { id: "po-tracking", label: "PO Tracking", icon: FileText, keywords: "purchase orders po tracking" },
  { id: "items", label: "Items Catalog", icon: Box, keywords: "items products catalog inventory" },
  { id: "stats", label: "Stats & Reports", icon: BarChart3, keywords: "stats analytics reports charts" },
];

const ADMIN_ITEMS = [
  { id: "users", label: "Users Management", icon: Users, keywords: "users management roles" },
];

const ACTION_ITEMS = [
  { id: "create-order", label: "Create New Order", icon: Package, keywords: "create new order add" },
  { id: "toggle-voice", label: "Toggle Voice Commands", icon: Mic, keywords: "voice command speak microphone" },
  { id: "settings", label: "Open Settings", icon: Settings, keywords: "settings preferences profile" },
  { id: "logout", label: "Log Out", icon: LogOut, keywords: "logout sign out exit" },
];

export default function CommandPalette({ open, onOpenChange, onNavigate, onAction, isAdmin }: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAVIGATION_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.keywords}`}
              onSelect={() => {
                onNavigate(item.id);
                onOpenChange(false);
              }}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
          {isAdmin && ADMIN_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.keywords}`}
              onSelect={() => {
                onNavigate(item.id);
                onOpenChange(false);
              }}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {ACTION_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.keywords}`}
              onSelect={() => {
                onAction(item.id);
                onOpenChange(false);
              }}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
