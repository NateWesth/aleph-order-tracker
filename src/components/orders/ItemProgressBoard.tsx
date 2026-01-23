import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Package, Clock, Truck, CheckCircle, Box, Loader2, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/hooks/useUserData";
import { useOptimizedRealtime } from "@/hooks/useOptimizedRealtime";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  closestCorners,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

interface OrderItem {
  id: string;
  order_id: string;
  name: string;
  quantity: number;
  code: string | null;
  notes: string | null;
  stock_status: 'awaiting' | 'ordered' | 'in-stock';
  progress_stage: 'awaiting-stock' | 'in-stock' | 'packing' | 'delivery' | 'completed';
}

interface Order {
  id: string;
  order_number: string;
  reference: string | null;
  company_id: string | null;
  companyName: string;
  created_at: string;
  urgency: string | null;
}

interface OrderWithItems extends Order {
  items: OrderItem[];
}

interface ItemProgressBoardProps {
  isAdmin: boolean;
}

const PROGRESS_STAGES = [
  { id: 'awaiting-stock', label: 'Awaiting Stock', icon: Clock, color: 'bg-amber-500' },
  { id: 'in-stock', label: 'In Stock', icon: Box, color: 'bg-blue-500' },
  { id: 'packing', label: 'Packing', icon: Package, color: 'bg-purple-500' },
  { id: 'delivery', label: 'Delivery', icon: Truck, color: 'bg-orange-500' },
  { id: 'completed', label: 'Completed', icon: CheckCircle, color: 'bg-green-500' },
] as const;

type ProgressStageId = typeof PROGRESS_STAGES[number]['id'];

// Draggable Item Component
function DraggableItem({ 
  item, 
  order, 
  isUpdating,
  isDragging = false 
}: { 
  item: OrderItem; 
  order: Order;
  isUpdating: boolean;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.id,
    data: { item, order },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2 bg-muted/50 rounded text-xs space-y-1 transition-opacity ${
        isDragging ? 'opacity-50' : ''
      } ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab active:cursor-grabbing touch-none"
            disabled={isUpdating}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <span className="font-medium truncate">{item.name}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          x{item.quantity}
        </Badge>
      </div>
      {item.notes && (
        <p className="text-muted-foreground text-[10px] pl-5">{item.notes}</p>
      )}
      {item.code && (
        <p className="text-muted-foreground text-[10px] pl-5 font-mono">{item.code}</p>
      )}
    </div>
  );
}

// Drag Overlay Item (shown while dragging)
function DragOverlayItem({ item, order }: { item: OrderItem; order: Order }) {
  return (
    <div className="p-2 bg-card border border-primary rounded text-xs space-y-1 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-medium truncate">{item.name}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          x{item.quantity}
        </Badge>
      </div>
      <p className="text-muted-foreground text-[10px] pl-5">
        From: #{order.order_number}
      </p>
    </div>
  );
}

// Droppable Column Component
function DroppableColumn({ 
  stageId, 
  children 
}: { 
  stageId: ProgressStageId; 
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: stageId,
  });

  return (
    <div 
      ref={setNodeRef}
      className={`flex-1 min-h-full transition-all duration-200 rounded-lg ${
        isOver ? 'bg-primary/10 ring-2 ring-primary ring-offset-2' : ''
      }`}
    >
      {children}
    </div>
  );
}

export default function ItemProgressBoard({ isAdmin }: ItemProgressBoardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { role: userRole, userCompany } = useUserData();
  const userCompanyId = userCompany?.id || null;
  const isMobile = useIsMobile();
  
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState<{ item: OrderItem; order: Order } | null>(null);

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Fetch orders with their items
  const fetchOrdersWithItems = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // First fetch orders that are in progress (not pending, not completed)
      let ordersQuery = supabase
        .from('orders')
        .select(`
          id, order_number, reference, company_id, created_at, urgency,
          companies (name)
        `)
        .in('status', ['received', 'in-progress', 'processing'])
        .order('created_at', { ascending: true });

      // Apply user filtering if not admin
      if (userRole === 'user' && userCompanyId) {
        ordersQuery = ordersQuery.eq('company_id', userCompanyId);
      } else if (userRole === 'user' && !userCompanyId) {
        ordersQuery = ordersQuery.eq('user_id', user.id);
      }

      const { data: ordersData, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;

      if (!ordersData || ordersData.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Then fetch items for all orders
      const orderIds = ordersData.map(o => o.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      // Combine orders with their items
      const ordersWithItems: OrderWithItems[] = ordersData.map(order => ({
        id: order.id,
        order_number: order.order_number,
        reference: order.reference,
        company_id: order.company_id,
        companyName: (order.companies as any)?.name || 'Unknown Company',
        created_at: order.created_at,
        urgency: order.urgency,
        items: (itemsData || [])
          .filter(item => item.order_id === order.id)
          .map(item => ({
            id: item.id,
            order_id: item.order_id,
            name: item.name,
            quantity: item.quantity,
            code: item.code,
            notes: item.notes,
            stock_status: item.stock_status as 'awaiting' | 'ordered' | 'in-stock',
            progress_stage: (item.progress_stage || 'awaiting-stock') as ProgressStageId,
          }))
      }));

      setOrders(ordersWithItems);
      
      // Auto-expand orders that have items in multiple stages
      const ordersToExpand = ordersWithItems
        .filter(order => {
          const stages = new Set(order.items.map(i => i.progress_stage));
          return stages.size > 1;
        })
        .map(o => o.id);
      setExpandedOrders(new Set(ordersToExpand));
      
    } catch (error) {
      console.error('Error fetching orders with items:', error);
      toast({
        title: "Error",
        description: "Failed to load orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id && userRole && (userRole === 'admin' || userCompanyId !== null)) {
      fetchOrdersWithItems();
    }
  }, [user?.id, userRole, userCompanyId]);

  // Set up realtime subscription
  useOptimizedRealtime({
    table: 'order_items',
    event: '*',
    onUpdate: fetchOrdersWithItems,
  });

  // Move an item to a different progress stage
  const moveItemToStage = async (itemId: string, newStage: ProgressStageId) => {
    setUpdatingItems(prev => new Set(prev).add(itemId));
    
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ 
          progress_stage: newStage,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      setOrders(prev => prev.map(order => ({
        ...order,
        items: order.items.map(item => 
          item.id === itemId ? { ...item, progress_stage: newStage } : item
        )
      })));

      toast({
        title: "Item Moved",
        description: `Item moved to ${PROGRESS_STAGES.find(s => s.id === newStage)?.label}`,
      });
    } catch (error) {
      console.error('Error updating item:', error);
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    } finally {
      setUpdatingItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as { item: OrderItem; order: Order } | undefined;
    if (data) {
      setActiveItem(data);
    }
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const itemId = active.id as string;
    const newStage = over.id as ProgressStageId;

    // Find current item stage
    const currentItem = orders.flatMap(o => o.items).find(i => i.id === itemId);
    if (!currentItem || currentItem.progress_stage === newStage) return;

    // Move the item
    moveItemToStage(itemId, newStage);
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Group items by stage within each order, and group orders by stage
  const ordersByStage = useMemo(() => {
    const result: Record<ProgressStageId, OrderWithItems[]> = {
      'awaiting-stock': [],
      'in-stock': [],
      'packing': [],
      'delivery': [],
      'completed': [],
    };

    orders.forEach(order => {
      // For each stage, check if the order has items in that stage
      PROGRESS_STAGES.forEach(stage => {
        const itemsInStage = order.items.filter(item => item.progress_stage === stage.id);
        if (itemsInStage.length > 0) {
          // Create a copy of the order with only the items in this stage
          result[stage.id].push({
            ...order,
            items: itemsInStage
          });
        }
      });
    });

    return result;
  }, [orders]);

  const getUrgencyColor = (urgency: string | null) => {
    switch (urgency?.toLowerCase()) {
      case 'urgent':
      case 'high':
        return 'border-l-red-500';
      case 'medium':
        return 'border-l-orange-500';
      default:
        return 'border-l-border';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Item Progress Board</h2>
          <p className="text-sm text-muted-foreground">
            Drag items between columns to update progress
          </p>
        </div>

        {/* Desktop: Horizontal columns */}
        {!isMobile ? (
          <div className="grid grid-cols-5 gap-4 min-h-[600px]">
            {PROGRESS_STAGES.map(stage => {
              const StageIcon = stage.icon;
              const ordersInStage = ordersByStage[stage.id];
              const totalItems = ordersInStage.reduce((acc, o) => acc + o.items.length, 0);
              
              return (
                <DroppableColumn key={stage.id} stageId={stage.id}>
                  <Card className="flex flex-col h-full">
                    <CardHeader className="py-3 px-4 border-b">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${stage.color}`}>
                          <StageIcon className="h-4 w-4 text-white" />
                        </div>
                        <CardTitle className="text-sm font-medium">{stage.label}</CardTitle>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {totalItems}
                        </Badge>
                      </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                      <CardContent className="p-2 space-y-2">
                        {ordersInStage.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-8">
                            Drop items here
                          </p>
                        ) : (
                          ordersInStage.map(order => (
                            <Collapsible
                              key={`${stage.id}-${order.id}`}
                              open={expandedOrders.has(order.id)}
                              onOpenChange={() => toggleOrderExpansion(order.id)}
                            >
                              <div className={`border rounded-lg bg-card border-l-4 ${getUrgencyColor(order.urgency)}`}>
                                <CollapsibleTrigger className="w-full p-2 flex items-center justify-between hover:bg-muted/50 rounded-t-lg">
                                  <div className="text-left min-w-0">
                                    <p className="text-sm font-medium truncate">#{order.order_number}</p>
                                    <p className="text-xs text-muted-foreground truncate">{order.companyName}</p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Badge variant="outline" className="text-xs">
                                      {order.items.length}
                                    </Badge>
                                    {expandedOrders.has(order.id) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="px-2 pb-2 space-y-1.5">
                                    {order.items.map(item => (
                                      <DraggableItem
                                        key={item.id}
                                        item={item}
                                        order={order}
                                        isUpdating={updatingItems.has(item.id)}
                                        isDragging={activeItem?.item.id === item.id}
                                      />
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          ))
                        )}
                      </CardContent>
                    </ScrollArea>
                  </Card>
                </DroppableColumn>
              );
            })}
          </div>
        ) : (
          /* Mobile: Stacked cards with buttons (drag not optimal on mobile) */
          <div className="space-y-4">
            {PROGRESS_STAGES.map(stage => {
              const StageIcon = stage.icon;
              const ordersInStage = ordersByStage[stage.id];
              const totalItems = ordersInStage.reduce((acc, o) => acc + o.items.length, 0);
              
              if (totalItems === 0) return null;
              
              return (
                <Card key={stage.id}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${stage.color}`}>
                        <StageIcon className="h-4 w-4 text-white" />
                      </div>
                      <CardTitle className="text-sm font-medium">{stage.label}</CardTitle>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {totalItems} items
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 space-y-2">
                    {ordersInStage.map(order => (
                      <Collapsible
                        key={`${stage.id}-${order.id}`}
                        open={expandedOrders.has(order.id)}
                        onOpenChange={() => toggleOrderExpansion(order.id)}
                      >
                        <div className={`border rounded-lg bg-card border-l-4 ${getUrgencyColor(order.urgency)}`}>
                          <CollapsibleTrigger className="w-full p-3 flex items-center justify-between">
                            <div className="text-left min-w-0">
                              <p className="text-sm font-medium">#{order.order_number}</p>
                              <p className="text-xs text-muted-foreground">{order.companyName}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {order.items.length} items
                              </Badge>
                              {expandedOrders.has(order.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-3 pb-3 space-y-2">
                              {order.items.map(item => (
                                <div
                                  key={item.id}
                                  className="p-3 bg-muted/50 rounded space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-medium text-sm">{item.name}</span>
                                    <Badge variant="secondary" className="text-xs shrink-0">
                                      x{item.quantity}
                                    </Badge>
                                  </div>
                                  {/* Stage movement buttons for mobile */}
                                  <div className="flex flex-wrap gap-1.5">
                                    {PROGRESS_STAGES.filter(s => s.id !== stage.id).map(nextStage => {
                                      const NextIcon = nextStage.icon;
                                      return (
                                        <Button
                                          key={nextStage.id}
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => moveItemToStage(item.id, nextStage.id)}
                                          disabled={updatingItems.has(item.id)}
                                        >
                                          {updatingItems.has(item.id) ? (
                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                          ) : (
                                            <NextIcon className="h-3 w-3 mr-1" />
                                          )}
                                          {nextStage.label}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
            
            {Object.values(ordersByStage).every(arr => arr.length === 0) && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No items in progress</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Drag overlay - shows the item being dragged */}
      <DragOverlay>
        {activeItem ? (
          <DragOverlayItem item={activeItem.item} order={activeItem.order} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
