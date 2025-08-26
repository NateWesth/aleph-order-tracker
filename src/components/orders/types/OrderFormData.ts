
export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

export interface OrderFormData {
  orderNumber: string;
  reference?: string;
  companyId: string;
  totalAmount: number;
  urgency: string;
  notes?: string;
  items: OrderItem[];
}
