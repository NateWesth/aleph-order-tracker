
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, AlertCircle, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TodoItem {
  id: string;
  order_number: string;
  status: string;
  urgency: string;
  created_at: string;
  company_name?: string;
  action_needed: string;
  priority: 'high' | 'medium' | 'low';
}

export default function TodoList() {
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchTodoItems();
  }, []);

  const fetchTodoItems = async () => {
    try {
      // Fetch orders that need attention
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          urgency,
          created_at,
          company_id,
          companies (name)
        `)
        .in('status', ['pending', 'received', 'processing'])
        .order('created_at', { ascending: false });

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
            actionNeeded = 'Start processing order';
            priority = 'medium';
            break;
          case 'processing':
            actionNeeded = 'Continue processing';
            priority = 'low';
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
          priority
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-aleph-green" />
            Order To-Do List
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="text-lg">Loading todos...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-aleph-green" />
          Order To-Do List ({todoItems.length} items)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todoItems.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-aleph-green mx-auto mb-4" />
            <div className="text-lg font-medium text-gray-600">All caught up!</div>
            <div className="text-sm text-gray-500">No pending orders to review</div>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {todoItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                  {getPriorityIcon(item.priority)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{item.order_number}</span>
                      <Badge variant="outline" className={getStatusColor(item.status)}>
                        {item.status}
                      </Badge>
                      {item.urgency === 'urgent' && (
                        <Badge variant="outline" className="bg-red-100 text-red-800">
                          Urgent
                        </Badge>
                      )}
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
