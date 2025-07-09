export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered_quantity?: number;
  unit?: string;
  notes?: string;
}

export interface Order {
  id: string;
  order_number: string;
  description?: string;
  status: string;
  progress_stage?: string;
  total_amount?: number;
  created_at: string;
  updated_at: string;
  completed_date?: string;
  company_id?: string;
  user_id?: string;
  items?: OrderItem[];
  companyName?: string;
}

export function useOrderData() {
  // This is now a simple re-export that combines the hooks
  // We keep this file for backward compatibility
  const { useOrderFetch } = require('./useOrderFetch');
  const { useOrderUpdates } = require('./useOrderUpdates');
  
  return {
    ...useOrderFetch(),
    ...useOrderUpdates()
  };
}
