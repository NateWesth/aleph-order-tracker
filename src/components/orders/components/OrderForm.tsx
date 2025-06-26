
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import { getUserProfile, getUserRole } from "@/utils/authService";
import { useAuth } from "@/contexts/AuthContext";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface OrderFormProps {
  onSubmit: (orderData: {
    description: string;
    companyId: string;
    totalAmount: number;
    items: OrderItem[];
  }) => void;
  loading?: boolean;
}

const OrderForm = ({ onSubmit, loading = false }: OrderFormProps) => {
  const { user } = useAuth();
  const { companies, loading: companiesLoading, userRole } = useCompanyData();
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [items, setItems] = useState<OrderItem[]>([
    { id: crypto.randomUUID(), name: "", quantity: 1, unit: "", notes: "" }
  ]);

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user?.id) return;

      try {
        const [role, profile] = await Promise.all([
          getUserRole(user.id),
          getUserProfile(user.id)
        ]);

        if (role === 'user' && profile?.company_id) {
          setUserCompanyId(profile.company_id);
          setSelectedCompanyId(profile.company_id);
        }
      } catch (error) {
        console.error("Error fetching user info:", error);
      }
    };

    fetchUserInfo();
  }, [user?.id]);

  const addItem = () => {
    setItems([...items, { 
      id: crypto.randomUUID(), 
      name: "", 
      quantity: 1, 
      unit: "", 
      notes: "" 
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof OrderItem, value: string | number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCompanyId) {
      return;
    }

    const validItems = items.filter(item => item.name.trim() && item.quantity > 0);
    
    if (validItems.length === 0) {
      return;
    }

    onSubmit({
      description,
      companyId: selectedCompanyId,
      totalAmount,
      items: validItems
    });
  };

  if (companiesLoading) {
    return <div>Loading companies...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="description">Order Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the order requirements..."
          required
        />
      </div>

      {userRole === 'admin' && (
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId} required>
            <SelectTrigger>
              <SelectValue placeholder="Select a company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name} ({company.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {userRole === 'user' && userCompanyId && (
        <div className="space-y-2">
          <Label>Company</Label>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {companies.find(c => c.id === userCompanyId)?.name || 'Your Company'}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Order Items
            <Button type="button" onClick={addItem} size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <Label htmlFor={`item-name-${item.id}`}>Item Name</Label>
                <Input
                  id={`item-name-${item.id}`}
                  value={item.name}
                  onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                  placeholder="Enter item name"
                  required
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor={`item-quantity-${item.id}`}>Quantity</Label>
                <Input
                  id={`item-quantity-${item.id}`}
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                  min="1"
                  required
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor={`item-unit-${item.id}`}>Unit</Label>
                <Input
                  id={`item-unit-${item.id}`}
                  value={item.unit || ''}
                  onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                  placeholder="e.g., kg, pcs"
                />
              </div>
              <div className="col-span-3">
                <Label htmlFor={`item-notes-${item.id}`}>Notes</Label>
                <Input
                  id={`item-notes-${item.id}`}
                  value={item.notes || ''}
                  onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                  placeholder="Additional notes"
                />
              </div>
              <div className="col-span-1">
                <Button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  size="sm"
                  variant="outline"
                  disabled={items.length === 1}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="totalAmount">Total Amount (Optional)</Label>
        <Input
          id="totalAmount"
          type="number"
          value={totalAmount}
          onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
          placeholder="0.00"
          step="0.01"
          min="0"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating Order..." : "Create Order"}
      </Button>
    </form>
  );
};

export default OrderForm;
