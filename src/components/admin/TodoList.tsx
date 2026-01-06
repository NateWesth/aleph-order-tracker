import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, AlertCircle, Package, BarChart2, FileText, Flame } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TodoListSkeleton } from "@/components/ui/skeletons";
interface TodoItem {
  id: string;
  order_number: string;
  status: string;
  urgency: string;
  created_at: string;
  company_name?: string;
  action_needed: string;
  priority: 'high' | 'medium' | 'low';
  progress_stage?: string;
}
export default function TodoList() {
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    toast
  } = useToast();
  useEffect(() => {
    fetchTodoItems();
  }, []);
  const fetchTodoItems = async () => {
    try {
      // Fetch orders that need attention
      const {
        data: orders,
        error
      } = await supabase.from('orders').select(`
          id,
          order_number,
          status,
          urgency,
          created_at,
          company_id,
          progress_stage,
          companies (name)
        `).in('status', ['pending', 'received', 'processing', 'in-progress']).order('created_at', {
        ascending: false
      });
      if (error) throw error;

      // Transform orders into todo items
      const todos: TodoItem[] = orders?.map(order => {
        let actionNeeded = '';
        let priority: 'high' | 'medium' | 'low' = 'medium';
        switch (order.status) {
          case 'pending':
            actionNeeded = 'Review and receive order';
            priority = order.urgency === 'urgent' ? 'high' : 'medium';
            break;
          case 'received':
          case 'in-progress':
            actionNeeded = 'Track progress and update status';
            priority = 'medium';
            break;
          case 'processing':
            actionNeeded = 'Upload required files';
            priority = 'high';
            break;
        }
        return {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          urgency: order.urgency || 'normal',
          created_at: order.created_at,
          company_name: order.companies?.name || 'Unknown Company',
          action_needed: actionNeeded,
          priority,
          progress_stage: order.progress_stage
        };
      }) || [];
      setTodoItems(todos);
    } catch (error) {
      console.error('Error fetching todo items:', error);
      toast({
        title: "Error",
        description: "Failed to load todo items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleOrderClick = (order: TodoItem) => {
    // Dispatch custom event to change active view in AdminDashboard
    const status = order.status?.toLowerCase();
    let targetView = 'orders';
    switch (status) {
      case 'pending':
        targetView = 'orders';
        break;
      case 'received':
      case 'in-progress':
        targetView = 'progress';
        break;
      case 'processing':
        targetView = 'processing';
        break;
      case 'completed':
        targetView = 'completed';
        break;
      default:
        targetView = 'orders';
    }
    const event = new CustomEvent('setActiveView', {
      detail: targetView
    });
    window.dispatchEvent(event);
  };
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Package className="h-4 w-4 text-blue-500" />;
    }
  };
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-orange-100 text-orange-800';
      case 'received':
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const isOrderOld = (createdAt: string) => {
    const orderDate = new Date(createdAt);
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    return orderDate < fourDaysAgo;
  };

  // Get priority items (urgent orders or orders older than 4 days that haven't moved to processing)
  const priorityItems = todoItems.filter(item => item.urgency === 'urgent' || isOrderOld(item.created_at) && item.status !== 'processing');

  // Categorize items based on the new requirements
  const pendingItems = todoItems.filter(item => item.status === 'pending');
  const progressItems = todoItems.filter(item => (item.status === 'received' || item.status === 'in-progress') && (!item.progress_stage || item.progress_stage === 'packaging' || item.progress_stage === 'packing'));
  const processingItems = todoItems.filter(item => item.status === 'processing');
  if (loading) {
    return <TodoListSkeleton />;
  }
  const renderTodoSection = (items: TodoItem[], title: string, icon: React.ReactNode, emptyMessage: string) => <Card className="flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-inherit">
          {icon}
          {title} ({items.length} items)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? <div className="text-center py-4">
            <div className="text-sm text-gray-500">{emptyMessage}</div>
          </div> : <div className="space-y-3 max-h-64 overflow-y-auto">
            {items.map(item => <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleOrderClick(item)}>
                <div className="flex items-center gap-3 flex-1">
                  {getPriorityIcon(item.priority)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{item.order_number}</span>
                      <Badge variant="outline" className={getStatusColor(item.status)}>
                        {item.status}
                      </Badge>
                      {item.urgency === 'urgent' && <Badge variant="outline" className="bg-red-100 text-red-800">
                          Urgent
                        </Badge>}
                      {item.progress_stage && <Badge variant="outline" className="bg-gray-100 text-gray-800">
                          {item.progress_stage}
                        </Badge>}
                    </div>
                    <div className="text-sm text-gray-600">
                      {item.action_needed} • {item.company_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Created: {formatDate(item.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={getPriorityColor(item.priority)}>
                    {item.priority}
                  </Badge>
                </div>
              </div>)}
          </div>}
      </CardContent>
    </Card>;
  return <div className="space-y-6 w-full">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Order Management Dashboard</h2>
        <p className="text-sm text-gray-600">Track and manage orders across different stages</p>
      </div>
      
      {/* Priority Section */}
      {priorityItems.length > 0 && <div className="mb-6 w-full">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-red-500" />
                🔥 Priority Orders ({priorityItems.length} items)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {priorityItems.map(item => <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleOrderClick(item)}>
                    <div className="flex items-center gap-3 flex-1">
                      {getPriorityIcon(item.priority)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{item.order_number}</span>
                          <Badge variant="outline" className={getStatusColor(item.status)}>
                            {item.status}
                          </Badge>
                          {item.urgency === 'urgent' && <Badge variant="outline" className="bg-red-100 text-red-800">
                              Urgent
                            </Badge>}
                          {item.progress_stage && <Badge variant="outline" className="bg-gray-100 text-gray-800">
                              {item.progress_stage}
                            </Badge>}
                        </div>
                        <div className="text-sm text-gray-600">
                          {item.action_needed} • {item.company_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          Created: {formatDate(item.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getPriorityColor(item.priority)}>
                        {item.priority}
                      </Badge>
                    </div>
                  </div>)}
              </div>
            </CardContent>
          </Card>
        </div>}
      
      <div className="flex gap-4 w-full">
        {renderTodoSection(pendingItems, "Pending Orders", <AlertCircle className="h-5 w-5 text-orange-500" />, "No pending orders to review")}
        
        {renderTodoSection(progressItems, "In Progress", <BarChart2 className="h-5 w-5 text-blue-500" />, "No orders awaiting packaging/packing")}
        
        {renderTodoSection(processingItems, "Processing", <FileText className="h-5 w-5 text-purple-500" />, "No orders awaiting file uploads")}
      </div>

      {todoItems.length === 0 && <Card>
          <CardContent className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-aleph-green mx-auto mb-4" />
            <div className="text-lg font-medium text-gray-600">All caught up!</div>
            <div className="text-sm text-gray-500">No orders need immediate attention</div>
          </CardContent>
        </Card>}
    </div>;
}