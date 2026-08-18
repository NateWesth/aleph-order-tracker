import { useNavigate } from "react-router-dom";
import { PageTransition } from "@/components/ui/PageTransition";
import AuroraBackground from "@/components/ui/AuroraBackground";
import OnboardingTour from "@/components/ui/OnboardingTour";
import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Package, History, BarChart3, Settings, LogOut, Building2, Box, Users, Truck, FileText, Command, ShoppingCart, Percent, Sparkles, Bot, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import ChangelogDialog, { hasUnreadChangelog } from "@/components/admin/ChangelogDialog";
import KeyboardShortcutsDialog from "@/components/admin/KeyboardShortcutsDialog";
import { playClick, playWhoosh } from "@/utils/ambientSounds";
import NotificationCenter from "@/components/NotificationCenter";
import CommandPalette from "@/components/admin/CommandPalette";
import VoiceCommandButton from "@/components/admin/VoiceCommandButton";
import SmartSearch from "@/components/admin/SmartSearch";
import ActivityFeedSidebar from "@/components/admin/ActivityFeedSidebar";
import OnlinePresenceIndicator from "@/components/admin/OnlinePresenceIndicator";
import { Badge } from "@/components/ui/badge";
import { AlephLoadingMark, PageSkeleton } from "@/components/ui/PageSkeleton";
import ToolbarWatermark from "@/components/ui/ToolbarWatermark";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGlobalUnreadCount } from "@/hooks/useGlobalUnreadCount";
import { cn } from "@/lib/utils";
import { triggerHapticFeedback } from "@/utils/haptics";

// Route-level splitting keeps the dashboard interactive while large workspaces
// (buying, commission, analytics and AI) download only when opened.
const loadOrdersPage = () => import("@/components/orders/OrdersPage");
const loadCompletedPage = () => import("@/components/orders/CompletedPage");
const loadClientCompaniesPage = () => import("@/components/admin/ClientCompaniesPage");
const loadStatsPage = () => import("@/components/admin/StatsPage");
const loadItemsPage = () => import("@/components/admin/ItemsPage");
const loadCustomizableDashboard = () => import("@/components/admin/CustomizableDashboard");
const loadUsersManagementPage = () => import("@/components/admin/UsersManagementPage");
const loadSuppliersPage = () => import("@/components/admin/SuppliersPage");
const loadPOTrackingPage = () => import("@/components/admin/POTrackingPage");
const loadBuyingSheetPage = () => import("@/components/admin/BuyingSheetPage");
const loadCommissionPage = () => import("@/components/admin/CommissionPage");

const OrdersPage = lazy(loadOrdersPage);
const CompletedPage = lazy(loadCompletedPage);
const ClientCompaniesPage = lazy(loadClientCompaniesPage);
const StatsPage = lazy(loadStatsPage);
const ItemsPage = lazy(loadItemsPage);
const CustomizableDashboard = lazy(loadCustomizableDashboard);
const UsersManagementPage = lazy(loadUsersManagementPage);
const SuppliersPage = lazy(loadSuppliersPage);
const POTrackingPage = lazy(loadPOTrackingPage);
const BuyingSheetPage = lazy(loadBuyingSheetPage);
const CommissionPage = lazy(loadCommissionPage);
const FloatingAIChat = lazy(() => import("@/components/admin/FloatingAIChat"));

const WORKSPACE_PREFETCHERS: Record<string, () => Promise<unknown>> = {
  home: loadCustomizableDashboard,
  orders: loadOrdersPage,
  history: loadCompletedPage,
  clients: loadClientCompaniesPage,
  suppliers: loadSuppliersPage,
  stats: loadStatsPage,
  "po-tracking": loadPOTrackingPage,
  "buying-sheet": loadBuyingSheetPage,
  items: loadItemsPage,
  commission: loadCommissionPage,
  users: loadUsersManagementPage,
};

const RAIL_STORAGE_KEY = "aleph:workspace-rail-expanded";
const WORKSPACE_STORAGE_KEY = "aleph:last-workspace";
const RESTORABLE_WORKSPACES = new Set(["home", "orders", "history", "clients", "suppliers", "stats", "po-tracking", "buying-sheet", "items"]);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [activeView, setActiveView] = useState(() => {
    if (typeof window === "undefined") return "orders";
    const savedView = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return savedView && RESTORABLE_WORKSPACES.has(savedView) ? savedView : "orders";
  });
  const [searchTerm] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [loading, setLoading] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [hasNewChangelog, setHasNewChangelog] = useState(false);
  const [railExpanded, setRailExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(RAIL_STORAGE_KEY) !== "false";
  });
  const [railQuery, setRailQuery] = useState("");
  const isMobile = useIsMobile();
  const headerRef = useRef<HTMLElement | null>(null);
  const contentScrollRef = useRef<HTMLElement | null>(null);
  const workspaceScrollPositions = useRef<Record<string, number>>({});
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeaderHeight = () => setHeaderHeight(header.getBoundingClientRect().height);

    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RAIL_STORAGE_KEY, String(railExpanded));
  }, [railExpanded]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, activeView);
    const scroller = contentScrollRef.current;
    if (!scroller) return;

    const animationFrame = window.requestAnimationFrame(() => {
      scroller.scrollTop = workspaceScrollPositions.current[activeView] ?? 0;
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      workspaceScrollPositions.current[activeView] = scroller.scrollTop;
    };
  }, [activeView]);

  useEffect(() => { setHasNewChangelog(hasUnreadChangelog()); }, []);
  const { unreadOrderUpdates, pendingOrdersCount } = useGlobalUnreadCount();
  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchUserRole();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }
      setUserProfile(data);
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRole = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return;
      }
      
      if (data) {
        setUserRole(data.role);
      }
    } catch (error) {
      console.error('Unexpected error fetching user role:', error);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out."
    });
    navigate("/");
  };

  // Keyboard shortcuts: Cmd/Ctrl+K opens actions and Cmd/Ctrl+\ toggles the rail.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(prev => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setRailExpanded(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCommandAction = useCallback((action: string) => {
    switch (action) {
      case "create-order":
        setActiveView("orders");
        break;
      case "settings":
        navigate("/settings");
        break;
      case "logout":
        handleLogout();
        break;
      case "toggle-voice":
        // Voice toggle handled by the button itself
        break;
    }
  }, [navigate]);

  const handleVoiceCommand = useCallback((command: string) => {
    const [type, target] = command.split(":");
    if (type === "navigate") {
      setActiveView(target);
    } else if (type === "action") {
      handleCommandAction(target);
    }
  }, [handleCommandAction]);

  const prefetchWorkspace = useCallback((view: string) => {
    void WORKSPACE_PREFETCHERS[view]?.();
  }, []);

  const isAdmin = userRole === 'admin';
  const canEditCommission = isAdmin || !!userProfile?.can_edit_commission;

  const navItems = [
    { id: "orders", label: "Orders", icon: Package, badge: pendingOrdersCount },
    { id: "history", label: "History", icon: History, badge: unreadOrderUpdates },
    { id: "clients", label: "Clients", icon: Building2, badge: 0 },
    { id: "suppliers", label: "Suppliers", icon: Truck, badge: 0 },
    { id: "stats", label: "Stats", icon: BarChart3, badge: 0 },
    { id: "po-tracking", label: "PO Tracking", icon: FileText, badge: 0 },
    { id: "buying-sheet", label: "Buying", icon: ShoppingCart, badge: 0 },
    { id: "items", label: "Items", icon: Box, badge: 0 },
    ...(canEditCommission ? [{ id: "commission", label: "Commission", icon: Percent, badge: 0 }] : []),
    ...(isAdmin ? [{ id: "users", label: "Users", icon: Users, badge: 0 }] : []),
  ];
  const filteredNavItems = railQuery.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(railQuery.trim().toLowerCase()))
    : navItems;

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <AlephLoadingMark label="Opening Aleph" />
      </div>
    );
  }

  return (
    <div
      className="app-shell h-[100dvh] min-h-0 w-full flex flex-col bg-background overflow-hidden relative"
      style={{ "--aleph-header-height": `${headerHeight}px` } as any}
    >
      <AuroraBackground />
      {/* Modern Top Navigation Bar */}
      <header ref={headerRef} className="aleph-topbar relative z-50 w-full shrink-0 border-b shadow-soft">
        <ToolbarWatermark />
        <div className="ribbon-bar" aria-hidden />
        <div className="w-full px-2 sm:px-3 py-2 sm:py-3">
          {/* Top row: Logo/Home, Search, Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Home/Brand */}
            <Button
              variant={activeView === "home" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setActiveView("home")}
              onPointerEnter={() => prefetchWorkspace("home")}
              onFocus={() => prefetchWorkspace("home")}
              className="aleph-home-button shrink-0 rounded-2xl h-12 w-12 sm:h-14 sm:w-14 p-1.5"
              data-tour="home"
              title="Home"
            >
              <img
                src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
                alt="Aleph"
                className="h-full w-full object-contain"
              />
            </Button>

            {/* Smart Search bar - grows to fill space */}
            <div className="flex-1 min-w-0" data-tour="search">
              <SmartSearch
                onNavigate={(view) => setActiveView(view)}
                className="aleph-smart-search"
              />
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1">
              <OnlinePresenceIndicator currentView={activeView} />
              <VoiceCommandButton onCommand={handleVoiceCommand} className="hidden md:inline-flex" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.dispatchEvent(new CustomEvent("aleph:toggle-ai"))}
                className="relative rounded-xl text-primary hover:bg-primary/10"
                title="Open Aleph AI"
                aria-label="Open Aleph AI assistant"
              >
                <Bot className="h-[19px] w-[19px]" />
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-background" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCommandOpen(true)}
                className="hidden sm:flex rounded-xl text-muted-foreground hover:text-foreground"
                title="Command Palette (⌘K)"
              >
                <Command className="h-[18px] w-[18px]" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setChangelogOpen(true); setHasNewChangelog(false); }}
                className="relative hidden sm:inline-flex rounded-xl text-muted-foreground hover:text-foreground"
                title="What's new"
              >
                <Sparkles className="h-[18px] w-[18px]" />
                {hasNewChangelog && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </Button>
              <NotificationCenter
                onNavigateToOrder={(orderId) => {
                  setActiveView("orders");
                }}
                data-tour="notifications"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/settings")}
                className="rounded-xl text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-[18px] w-[18px]" />
              </Button>
              <Button
                variant="ghost"
                size={isMobile ? "icon" : "default"}
                onClick={handleLogout}
                className="rounded-xl text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-[18px] w-[18px]" />
                {!isMobile && <span className="ml-2 text-sm">Logout</span>}
              </Button>
            </div>
          </div>

          {/* Navigation Tabs - Hidden on mobile, shown on tablet+ */}
          <nav className="hidden sm:flex lg:hidden flex-wrap items-center gap-0.5 sm:gap-1 mt-2 sm:mt-3 -mb-3 overflow-hidden pb-px">
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    playClick();
                    setActiveView(item.id);
                  }}
                  onPointerEnter={() => prefetchWorkspace(item.id)}
                  onFocus={() => prefetchWorkspace(item.id)}
                  data-tour={`nav-${item.id}`}
                  className={cn(
                    "relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-t-xl transition-all duration-200 whitespace-nowrap active:scale-[0.97]",
                    "border-b-[3px] -mb-[2px]",
                    isActive
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  <div className="relative">
                    <item.icon className="h-4 w-4" />
                    {item.badge > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* The application frame is viewport-locked. Only the active page canvas
          (or an Orders Board column) owns vertical scrolling. */}
      <div className="aleph-shell-workspace flex min-h-0 w-full flex-1 items-stretch overflow-hidden">
        <aside
          id="aleph-workspace-navigation"
          data-expanded={railExpanded}
          className={cn(
            "aleph-workspace-rail fixed left-0 hidden shrink-0 flex-col overflow-visible border-r border-border/55 bg-card/95 py-4 backdrop-blur-xl lg:flex",
            railExpanded ? "w-[248px] px-3" : "w-[72px] px-2",
          )}
          style={{ top: headerHeight, height: `calc(100dvh - ${headerHeight}px)` }}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            <div className={cn("aleph-rail-head mb-3 flex h-12 shrink-0 items-center", railExpanded ? "justify-between gap-2 px-1" : "justify-center")}>
              <div className={cn("aleph-rail-copy min-w-0 whitespace-nowrap", railExpanded ? "translate-x-0 opacity-100" : "pointer-events-none absolute -translate-x-3 opacity-0")}>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Control centre</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Your live workspaces</p>
              </div>
            </div>

          <div className={cn("aleph-rail-search relative shrink-0 overflow-hidden", railExpanded ? "mb-3 max-h-12 translate-y-0 opacity-100" : "mb-0 max-h-0 -translate-y-2 opacity-0")}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={railQuery}
              onChange={(event) => setRailQuery(event.target.value)}
              placeholder="Find workspace..."
              className="h-10 w-full rounded-2xl border border-border/60 bg-background/60 pl-9 pr-3 text-xs font-semibold outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/35 focus:bg-background focus:ring-4 focus:ring-primary/8"
              tabIndex={railExpanded ? 0 : -1}
              aria-label="Filter workspaces"
            />
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1" aria-label="Workspace navigation">
            {filteredNavItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(event) => { playClick(); setActiveView(item.id); event.currentTarget.blur(); }}
                  onPointerEnter={() => prefetchWorkspace(item.id)}
                  onFocus={() => prefetchWorkspace(item.id)}
                  title={railExpanded ? undefined : item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "aleph-rail-item relative flex w-full items-center gap-3 overflow-hidden rounded-2xl py-2.5 text-left text-sm font-bold transition-all duration-300",
                    railExpanded ? "px-3" : "justify-center px-1.5",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_14px_30px_-18px_hsl(var(--primary))]"
                      : "text-muted-foreground hover:bg-primary/8 hover:text-foreground",
                  )}
                >
                  <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300", isActive ? "bg-white/15" : "bg-muted/70 group-hover:bg-primary/10")}>
                    <item.icon className="h-[18px] w-[18px]" />
                    {!railExpanded && item.badge > 0 && <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-card" />}
                  </span>
                  <span className={cn("aleph-rail-label min-w-0 flex-1 truncate transition-all duration-300", railExpanded ? "translate-x-0 opacity-100" : "pointer-events-none absolute translate-x-3 opacity-0")}>{item.label}</span>
                  {item.badge > 0 && (
                    <span className={cn("min-w-5 rounded-full px-1.5 py-0.5 text-center text-[9px] font-black transition-all duration-300", railExpanded ? "translate-x-0 opacity-100" : "pointer-events-none absolute translate-x-3 opacity-0", isActive ? "bg-white/20 text-white" : "bg-primary/10 text-primary")}> 
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredNavItems.length === 0 && railExpanded && (
              <div className="rounded-2xl border border-dashed border-border/70 px-3 py-5 text-center text-xs font-semibold text-muted-foreground">
                No workspace matches “{railQuery}”
              </div>
            )}
          </nav>

          <div className="mt-3 shrink-0 space-y-1 border-t border-border/55 pt-3">
            <button type="button" onClick={() => navigate('/settings')} title={railExpanded ? undefined : "Preferences"} className={cn("aleph-rail-footer-action flex w-full items-center gap-3 rounded-2xl py-2 text-sm font-bold text-muted-foreground transition-all duration-300 hover:bg-primary/8 hover:text-foreground", railExpanded ? "px-3" : "justify-center px-1")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70"><Settings className="h-[18px] w-[18px]" /></span>
              <span className={cn("aleph-rail-label min-w-0 flex-1 text-left transition-all duration-300", railExpanded ? "translate-x-0 opacity-100" : "pointer-events-none absolute translate-x-3 opacity-0")}>Preferences</span>
            </button>
          </div>
          </div>

          <button
            type="button"
            onClick={() => setRailExpanded(prev => !prev)}
            className="aleph-rail-ribbon-toggle group/toggle absolute top-1/2 -right-[22px] z-50 flex h-16 w-[22px] -translate-y-1/2 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-expanded={railExpanded}
            aria-controls="aleph-workspace-navigation"
            title={`${railExpanded ? "Collapse" : "Expand"} control centre (Ctrl+\\)`}
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <PanelLeftClose className={cn("h-3.5 w-3.5 transition-all duration-300", railExpanded ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
              <PanelLeftOpen className={cn("absolute h-3.5 w-3.5 transition-all duration-300", railExpanded ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} />
            </span>
            <span className="sr-only">{railExpanded ? "Collapse" : "Expand"} control centre</span>
          </button>

        </aside>
        <main ref={contentScrollRef} className={cn("aleph-content-scroll h-full min-h-0 min-w-0 flex-1 w-full overflow-x-hidden overflow-y-auto pb-16 transition-[margin-left] duration-500 ease-[cubic-bezier(.22,1,.36,1)] sm:pb-0", railExpanded ? "lg:ml-[248px]" : "lg:ml-[72px]")}>
          <div
            className={cn(
              "app-page-stage w-full px-3 sm:px-5 lg:px-6 py-4 sm:py-6",
              activeView === "orders" || activeView === "history" ? "max-w-none" : "max-w-[1480px] mx-auto"
            )}
          >
            <Suspense fallback={<PageSkeleton variant="table" />}>
            <PageTransition viewKey={activeView}>
              {activeView === "home" && (
                <CustomizableDashboard
                  userName={userProfile?.full_name}
                  onNavigate={(view) => setActiveView(view)}
                />
              )}
              {activeView === "orders" && <OrdersPage isAdmin={true} searchTerm={searchTerm} />}
              {activeView === "history" && <CompletedPage isAdmin={true} searchTerm={searchTerm} />}
              {activeView === "clients" && <ClientCompaniesPage />}
              {activeView === "suppliers" && <SuppliersPage />}
              {activeView === "po-tracking" && <POTrackingPage />}
              {activeView === "items" && <ItemsPage />}
              {activeView === "buying-sheet" && <BuyingSheetPage />}
              {activeView === "commission" && <CommissionPage />}
              {activeView === "users" && isAdmin && <UsersManagementPage />}
              {activeView === "stats" && <StatsPage />}
            </PageTransition>
            </Suspense>
          </div>
        </main>

        {/* Activity Feed Sidebar - desktop only */}
        <ActivityFeedSidebar />
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="aleph-mobile-nav fixed bottom-0 left-0 right-0 z-50 border-t sm:hidden safe-area-bottom">
        <div className="flex items-center justify-start gap-1 overflow-x-auto px-2 py-1 scrollbar-none snap-x">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  triggerHapticFeedback('light');
                  playClick();
                  setActiveView(item.id);
                }}
                onPointerDown={() => prefetchWorkspace(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-xl transition-all duration-200 min-w-[64px] snap-start",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground active:bg-muted active:scale-95"
                )}
              >
                <div className="relative">
                  <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-primary text-primary-foreground rounded-full px-1">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  isActive && "font-semibold"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={(view) => setActiveView(view)}
        onAction={handleCommandAction}
        isAdmin={isAdmin}
      />

      {/* Floating AI Chat */}
      <Suspense fallback={null}><FloatingAIChat /></Suspense>

      {/* Changelog */}
      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />

      {/* Keyboard shortcuts (press ?) */}
      <KeyboardShortcutsDialog onNavigate={(view) => setActiveView(view)} />

      {/* Onboarding Tour */}
      <OnboardingTour />
    </div>
  );
};

export default AdminDashboard;
