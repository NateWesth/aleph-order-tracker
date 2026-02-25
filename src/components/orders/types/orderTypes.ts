
export interface PurchaseOrderInfo {
  id: string;
  supplier_id: string;
  purchase_order_number: string;
  supplierName?: string;
}

export interface OrderWithCompany {
  id: string;
  order_number: string;
  reference?: string | null;
  description?: string | null;
  notes?: string | null;
  status: string | null;
  total_amount?: number | null;
  created_at: string;
  updated_at?: string;
  completed_date?: string;
  company_id?: string | null;
  user_id?: string;
  progress_stage?: string;
  urgency?: string;
  items?: Array<{id: string, name: string, quantity: number, unit?: string, notes?: string}>;
  companyName: string;
  supplier_id?: string | null;
  purchase_order_number?: string | null;
  supplierName?: string | null;
  purchaseOrders?: PurchaseOrderInfo[];
  creatorName?: string | null;
}
