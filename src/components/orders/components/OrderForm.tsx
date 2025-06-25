
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrderFormProps {
  newOrder: {
    order_number: string;
    description: string;
    total_amount: string;
    company_id: string;
    user_id: string;
  };
  setNewOrder: (order: any) => void;
  isAdmin: boolean;
  companies: Array<{ id: string; name: string; code: string }>;
  profiles: Array<{ id: string; full_name: string; email: string; company_id: string }>;
  userProfile: any;
  onGenerateOrderNumber: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function OrderForm({
  newOrder,
  setNewOrder,
  isAdmin,
  companies,
  profiles,
  userProfile,
  onGenerateOrderNumber,
  onSubmit,
  onCancel
}: OrderFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="order_number">Order Number</Label>
        <div className="flex gap-2">
          <Input
            id="order_number"
            value={newOrder.order_number}
            onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value })}
            placeholder="Enter order number"
          />
          <Button 
            type="button" 
            variant="outline"
            onClick={onGenerateOrderNumber}
          >
            Generate
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={newOrder.description}
          onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })}
          placeholder="Enter order description"
          required
        />
      </div>

      <div>
        <Label htmlFor="total_amount">Total Amount</Label>
        <Input
          id="total_amount"
          type="number"
          step="0.01"
          value={newOrder.total_amount}
          onChange={(e) => setNewOrder({ ...newOrder, total_amount: e.target.value })}
          placeholder="Enter total amount"
        />
      </div>

      {/* Only show company selection for admin users */}
      {isAdmin && (
        <>
          <div>
            <Label htmlFor="company">Company</Label>
            <Select
              value={newOrder.company_id}
              onValueChange={(value) => setNewOrder({ ...newOrder, company_id: value, user_id: '' })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select company (optional)" />
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

          {newOrder.company_id && (
            <div>
              <Label htmlFor="user">Client User</Label>
              <Select
                value={newOrder.user_id}
                onValueChange={(value) => setNewOrder({ ...newOrder, user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client user (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name} ({profile.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {/* Show company info for client users */}
      {!isAdmin && userProfile && (
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This order will be created for your company.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit}>
          Create Order
        </Button>
      </div>
    </div>
  );
}
