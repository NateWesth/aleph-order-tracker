export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)";
  };
  public: {
    Tables: {
      buying_sheet_cache: {
        Row: {
          fetched_at: string;
          id: string;
          payload: Json;
        };
        Insert: {
          fetched_at?: string;
          id: string;
          payload: Json;
        };
        Update: {
          fetched_at?: string;
          id?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      client_invitations: {
        Row: {
          accepted_at: string | null;
          company_id: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          status: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          company_id: string;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          status?: string;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          company_id?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_invitations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_adjustments: {
        Row: {
          adjustment_type: string;
          amount: number;
          batch_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string | null;
          invoice_number: string | null;
          line_index: number | null;
          note: string | null;
          period_month: string;
          reason: string;
          rep_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          adjustment_type?: string;
          amount?: number;
          batch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          invoice_number?: string | null;
          line_index?: number | null;
          note?: string | null;
          period_month: string;
          reason: string;
          rep_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          adjustment_type?: string;
          amount?: number;
          batch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          invoice_number?: string | null;
          line_index?: number | null;
          note?: string | null;
          period_month?: string;
          reason?: string;
          rep_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commission_adjustments_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "commission_payout_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_adjustments_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "reps";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_item_cost_overrides: {
        Row: {
          cost: number;
          created_at: string;
          created_by: string | null;
          id: string;
          item_description: string;
          item_name: string;
          note: string | null;
          updated_at: string;
        };
        Insert: {
          cost: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_description?: string;
          item_name: string;
          note?: string | null;
          updated_at?: string;
        };
        Update: {
          cost?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_description?: string;
          item_name?: string;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      commission_line_overrides: {
        Row: {
          commission: number | null;
          commission_rate: number | null;
          cost: number | null;
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string;
          line_index: number;
          note: string | null;
          rep_id: string;
          sell_rate: number | null;
          sub_total: number | null;
          updated_at: string;
        };
        Insert: {
          commission?: number | null;
          commission_rate?: number | null;
          cost?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id: string;
          line_index: number;
          note?: string | null;
          rep_id: string;
          sell_rate?: number | null;
          sub_total?: number | null;
          updated_at?: string;
        };
        Update: {
          commission?: number | null;
          commission_rate?: number | null;
          cost?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string;
          line_index?: number;
          note?: string | null;
          rep_id?: string;
          sell_rate?: number | null;
          sub_total?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      commission_payout_batches: {
        Row: {
          adjustments_total: number;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string | null;
          gross_commission: number;
          id: string;
          invoice_count: number;
          net_payout: number;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          paid_reference: string | null;
          period_month: string;
          rep_id: string;
          status: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          adjustments_total?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          gross_commission?: number;
          id?: string;
          invoice_count?: number;
          net_payout?: number;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          paid_reference?: string | null;
          period_month: string;
          rep_id: string;
          status?: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          adjustments_total?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          gross_commission?: number;
          id?: string;
          invoice_count?: number;
          net_payout?: number;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          paid_reference?: string | null;
          period_month?: string;
          rep_id?: string;
          status?: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "commission_payout_batches_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "reps";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_payouts: {
        Row: {
          batch_id: string | null;
          commission_amount: number;
          commission_rate: number;
          created_at: string;
          customer_name: string | null;
          id: string;
          invoice_date: string | null;
          invoice_id: string;
          invoice_number: string | null;
          line_items: Json;
          locked_at: string;
          locked_by: string | null;
          period_month: string;
          rep_id: string;
          sub_total: number;
        };
        Insert: {
          batch_id?: string | null;
          commission_amount?: number;
          commission_rate?: number;
          created_at?: string;
          customer_name?: string | null;
          id?: string;
          invoice_date?: string | null;
          invoice_id: string;
          invoice_number?: string | null;
          line_items?: Json;
          locked_at?: string;
          locked_by?: string | null;
          period_month: string;
          rep_id: string;
          sub_total?: number;
        };
        Update: {
          batch_id?: string | null;
          commission_amount?: number;
          commission_rate?: number;
          created_at?: string;
          customer_name?: string | null;
          id?: string;
          invoice_date?: string | null;
          invoice_id?: string;
          invoice_number?: string | null;
          line_items?: Json;
          locked_at?: string;
          locked_by?: string | null;
          period_month?: string;
          rep_id?: string;
          sub_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "commission_payouts_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "commission_payout_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_payouts_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "reps";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_report_cache: {
        Row: {
          created_at: string;
          date_end: string;
          date_start: string;
          id: string;
          period_month: string;
          refreshed_at: string;
          rep_id: string | null;
          report: Json;
          updated_at: string;
          zoho_cost_prices: Json;
        };
        Insert: {
          created_at?: string;
          date_end: string;
          date_start: string;
          id?: string;
          period_month: string;
          refreshed_at?: string;
          rep_id?: string | null;
          report: Json;
          updated_at?: string;
          zoho_cost_prices?: Json;
        };
        Update: {
          created_at?: string;
          date_end?: string;
          date_start?: string;
          id?: string;
          period_month?: string;
          refreshed_at?: string;
          rep_id?: string | null;
          report?: Json;
          updated_at?: string;
          zoho_cost_prices?: Json;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          account_manager: string | null;
          address: string | null;
          code: string;
          contact_person: string | null;
          created_at: string | null;
          email: string | null;
          id: string;
          logo: string | null;
          name: string;
          phone: string | null;
          updated_at: string | null;
          vat_number: string | null;
        };
        Insert: {
          account_manager?: string | null;
          address?: string | null;
          code: string;
          contact_person?: string | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          logo?: string | null;
          name: string;
          phone?: string | null;
          updated_at?: string | null;
          vat_number?: string | null;
        };
        Update: {
          account_manager?: string | null;
          address?: string | null;
          code?: string;
          contact_person?: string | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          logo?: string | null;
          name?: string;
          phone?: string | null;
          updated_at?: string | null;
          vat_number?: string | null;
        };
        Relationships: [];
      };
      items: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          fulfillment_assigned_to: string | null;
          fulfillment_method: string;
          fulfillment_notes: string | null;
          fulfillment_scheduled_for: string | null;
          fulfillment_status: string;
          id: string;
          name: string;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          fulfillment_assigned_to?: string | null;
          fulfillment_method?: string;
          fulfillment_notes?: string | null;
          fulfillment_scheduled_for?: string | null;
          fulfillment_status?: string;
          id?: string;
          name: string;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          fulfillment_assigned_to?: string | null;
          fulfillment_method?: string;
          fulfillment_notes?: string | null;
          fulfillment_scheduled_for?: string | null;
          fulfillment_status?: string;
          id?: string;
          name?: string;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          metadata: Json | null;
          order_id: string | null;
          order_number: string | null;
          read: boolean;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          metadata?: Json | null;
          order_id?: string | null;
          order_number?: string | null;
          read?: boolean;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          metadata?: Json | null;
          order_id?: string | null;
          order_number?: string | null;
          read?: boolean;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_activity_log: {
        Row: {
          activity_type: string;
          created_at: string;
          description: string | null;
          id: string;
          metadata: Json | null;
          order_id: string;
          title: string;
          user_id: string | null;
        };
        Insert: {
          activity_type: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          metadata?: Json | null;
          order_id: string;
          title: string;
          user_id?: string | null;
        };
        Update: {
          activity_type?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          metadata?: Json | null;
          order_id?: string;
          title?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_activity_log_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_files: {
        Row: {
          created_at: string;
          file_name: string;
          file_size: number | null;
          file_type: string;
          file_url: string;
          id: string;
          mime_type: string | null;
          order_id: string;
          updated_at: string;
          uploaded_by_role: string;
          uploaded_by_user_id: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_size?: number | null;
          file_type: string;
          file_url: string;
          id?: string;
          mime_type?: string | null;
          order_id: string;
          updated_at?: string;
          uploaded_by_role: string;
          uploaded_by_user_id: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_size?: number | null;
          file_type?: string;
          file_url?: string;
          id?: string;
          mime_type?: string | null;
          order_id?: string;
          updated_at?: string;
          uploaded_by_role?: string;
          uploaded_by_user_id?: string;
        };
        Relationships: [];
      };
      order_item_comment_reactions: {
        Row: {
          comment_id: string;
          created_at: string;
          emoji: string;
          id: string;
          user_id: string;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          emoji: string;
          id?: string;
          user_id: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          emoji?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_item_comment_reactions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "order_item_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_item_comment_reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_item_comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          mentioned_user_ids: string[];
          order_item_id: string;
          reply_to_id: string | null;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          mentioned_user_ids?: string[];
          order_item_id: string;
          reply_to_id?: string | null;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          mentioned_user_ids?: string[];
          order_item_id?: string;
          reply_to_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_item_comments_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_item_comments_reply_to_id_fkey";
            columns: ["reply_to_id"];
            isOneToOne: false;
            referencedRelation: "order_item_comments";
            referencedColumns: ["id"];
          },
        ];
      };
      order_item_po_allocations: {
        Row: {
          created_at: string;
          id: string;
          order_id: string;
          order_item_id: string;
          purchase_order_number: string | null;
          quantity_ordered: number;
          quantity_received: number;
          sku: string | null;
          updated_at: string;
          vendor_name: string | null;
          zoho_purchaseorder_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          order_id: string;
          order_item_id: string;
          purchase_order_number?: string | null;
          quantity_ordered?: number;
          quantity_received?: number;
          sku?: string | null;
          updated_at?: string;
          vendor_name?: string | null;
          zoho_purchaseorder_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_id?: string;
          order_item_id?: string;
          purchase_order_number?: string | null;
          quantity_ordered?: number;
          quantity_received?: number;
          sku?: string | null;
          updated_at?: string;
          vendor_name?: string | null;
          zoho_purchaseorder_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_item_po_allocations_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_item_po_allocations_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          code: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          order_id: string;
          progress_stage: string;
          qty_completed: number;
          qty_invoiced: number;
          qty_on_po: number;
          qty_received: number;
          quantity: number;
          stock_status: string;
          updated_at: string;
        };
        Insert: {
          code?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          order_id: string;
          progress_stage?: string;
          qty_completed?: number;
          qty_invoiced?: number;
          qty_on_po?: number;
          qty_received?: number;
          quantity?: number;
          stock_status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          order_id?: string;
          progress_stage?: string;
          qty_completed?: number;
          qty_invoiced?: number;
          qty_on_po?: number;
          qty_received?: number;
          quantity?: number;
          stock_status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_purchase_orders: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          order_id: string;
          purchase_order_number: string;
          supplier_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          order_id: string;
          purchase_order_number: string;
          supplier_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          order_id?: string;
          purchase_order_number?: string;
          supplier_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_purchase_orders_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      order_tag_assignments: {
        Row: {
          assigned_by: string;
          created_at: string;
          id: string;
          order_id: string;
          tag_id: string;
        };
        Insert: {
          assigned_by: string;
          created_at?: string;
          id?: string;
          order_id: string;
          tag_id: string;
        };
        Update: {
          assigned_by?: string;
          created_at?: string;
          id?: string;
          order_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_tag_assignments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_tag_assignments_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "order_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      order_tags: {
        Row: {
          color: string;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      order_templates: {
        Row: {
          company_id: string | null;
          created_at: string;
          created_by: string;
          default_items: Json | null;
          default_notes: string | null;
          default_urgency: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          created_by: string;
          default_items?: Json | null;
          default_notes?: string | null;
          default_urgency?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          created_by?: string;
          default_items?: Json | null;
          default_notes?: string | null;
          default_urgency?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_templates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      order_update_reads: {
        Row: {
          id: string;
          order_update_id: string;
          read_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          order_update_id: string;
          read_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          order_update_id?: string;
          read_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_updates: {
        Row: {
          created_at: string;
          id: string;
          mentioned_user_ids: string[];
          message: string;
          order_id: string;
          parent_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mentioned_user_ids?: string[];
          message: string;
          order_id: string;
          parent_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mentioned_user_ids?: string[];
          message?: string;
          order_id?: string;
          parent_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_order_updates_user_id";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          assigned_to: string | null;
          company_id: string | null;
          completed_date: string | null;
          created_at: string | null;
          description: string | null;
          fulfillment_assigned_to: string | null;
          fulfillment_method: string;
          fulfillment_notes: string | null;
          fulfillment_routed_at: string | null;
          fulfillment_scheduled_for: string | null;
          fulfillment_status: string;
          id: string;
          notes: string | null;
          order_number: string;
          progress_stage: string | null;
          purchase_order_number: string | null;
          reference: string | null;
          status: string | null;
          supplier_id: string | null;
          total_amount: number | null;
          updated_at: string | null;
          urgency: string | null;
          user_id: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          company_id?: string | null;
          completed_date?: string | null;
          created_at?: string | null;
          description?: string | null;
          fulfillment_assigned_to?: string | null;
          fulfillment_method?: string;
          fulfillment_notes?: string | null;
          fulfillment_routed_at?: string | null;
          fulfillment_scheduled_for?: string | null;
          fulfillment_status?: string;
          id?: string;
          notes?: string | null;
          order_number: string;
          progress_stage?: string | null;
          purchase_order_number?: string | null;
          reference?: string | null;
          status?: string | null;
          supplier_id?: string | null;
          total_amount?: number | null;
          updated_at?: string | null;
          urgency?: string | null;
          user_id?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          company_id?: string | null;
          completed_date?: string | null;
          created_at?: string | null;
          description?: string | null;
          fulfillment_assigned_to?: string | null;
          fulfillment_method?: string;
          fulfillment_notes?: string | null;
          fulfillment_routed_at?: string | null;
          fulfillment_scheduled_for?: string | null;
          fulfillment_status?: string;
          id?: string;
          notes?: string | null;
          order_number?: string;
          progress_stage?: string | null;
          purchase_order_number?: string | null;
          reference?: string | null;
          status?: string | null;
          supplier_id?: string | null;
          total_amount?: number | null;
          updated_at?: string | null;
          urgency?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      po_collection_state: {
        Row: {
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          last_seen_at: string;
          notes: string | null;
          purchase_order_id: string;
          purchase_order_number: string;
          scheduled_for: string | null;
          status: string;
          updated_at: string;
          vendor_id: string | null;
          vendor_name: string;
        };
        Insert: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          last_seen_at?: string;
          notes?: string | null;
          purchase_order_id: string;
          purchase_order_number: string;
          scheduled_for?: string | null;
          status?: string;
          updated_at?: string;
          vendor_id?: string | null;
          vendor_name?: string;
        };
        Update: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          last_seen_at?: string;
          notes?: string | null;
          purchase_order_id?: string;
          purchase_order_number?: string;
          scheduled_for?: string | null;
          status?: string;
          updated_at?: string;
          vendor_id?: string | null;
          vendor_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "po_collection_state_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      po_collection_events: {
        Row: {
          collected_at: string;
          collected_by: string;
          created_at: string;
          fully_collected: boolean;
          id: string;
          notes: string | null;
          purchase_order_id: string;
          purchase_order_number: string;
          source_snapshot: Json;
          total_units: number;
          vendor_id: string | null;
          vendor_name: string;
        };
        Insert: {
          collected_at?: string;
          collected_by: string;
          created_at?: string;
          fully_collected?: boolean;
          id?: string;
          notes?: string | null;
          purchase_order_id: string;
          purchase_order_number: string;
          source_snapshot?: Json;
          total_units?: number;
          vendor_id?: string | null;
          vendor_name?: string;
        };
        Update: {
          collected_at?: string;
          collected_by?: string;
          created_at?: string;
          fully_collected?: boolean;
          id?: string;
          notes?: string | null;
          purchase_order_id?: string;
          purchase_order_number?: string;
          source_snapshot?: Json;
          total_units?: number;
          vendor_id?: string | null;
          vendor_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "po_collection_events_collected_by_fkey";
            columns: ["collected_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      po_collection_event_lines: {
        Row: {
          created_at: string;
          description: string | null;
          event_id: string;
          id: string;
          line_key: string;
          name: string;
          quantity_collected: number;
          sku: string | null;
          source_unbilled_quantity: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          event_id: string;
          id?: string;
          line_key: string;
          name: string;
          quantity_collected: number;
          sku?: string | null;
          source_unbilled_quantity?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          event_id?: string;
          id?: string;
          line_key?: string;
          name?: string;
          quantity_collected?: number;
          sku?: string | null;
          source_unbilled_quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "po_collection_event_lines_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "po_collection_events";
            referencedColumns: ["id"];
          },
        ];
      };
      po_tracking_cache: {
        Row: {
          created_at: string;
          fetched_at: string;
          id: string;
          payload: Json;
        };
        Insert: {
          created_at?: string;
          fetched_at?: string;
          id?: string;
          payload: Json;
        };
        Update: {
          created_at?: string;
          fetched_at?: string;
          id?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      fulfillment_settings: {
        Row: {
          auto_assign_enabled: boolean;
          default_method: string;
          id: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          auto_assign_enabled?: boolean;
          default_method?: string;
          id?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          auto_assign_enabled?: boolean;
          default_method?: string;
          id?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fulfillment_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          approved: boolean | null;
          can_edit_commission: boolean;
          company_code: string | null;
          company_id: string | null;
          created_at: string | null;
          daily_afternoon_report: boolean;
          daily_morning_report: boolean;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          position: string | null;
          updated_at: string | null;
          weekly_digest_email: boolean;
        };
        Insert: {
          approved?: boolean | null;
          can_edit_commission?: boolean;
          company_code?: string | null;
          company_id?: string | null;
          created_at?: string | null;
          daily_afternoon_report?: boolean;
          daily_morning_report?: boolean;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          position?: string | null;
          updated_at?: string | null;
          weekly_digest_email?: boolean;
        };
        Update: {
          approved?: boolean | null;
          can_edit_commission?: boolean;
          company_code?: string | null;
          company_id?: string | null;
          created_at?: string | null;
          daily_afternoon_report?: boolean;
          daily_morning_report?: boolean;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          position?: string | null;
          updated_at?: string | null;
          weekly_digest_email?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rep_company_assignment_history: {
        Row: {
          change_type: string;
          commission_rate: number | null;
          company_id: string;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          effective_to: string | null;
          id: string;
          rep_id: string;
        };
        Insert: {
          change_type?: string;
          commission_rate?: number | null;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          rep_id: string;
        };
        Update: {
          change_type?: string;
          commission_rate?: number | null;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          rep_id?: string;
        };
        Relationships: [];
      };
      rep_company_assignments: {
        Row: {
          commission_rate: number | null;
          company_id: string;
          created_at: string;
          id: string;
          rep_id: string;
        };
        Insert: {
          commission_rate?: number | null;
          company_id: string;
          created_at?: string;
          id?: string;
          rep_id: string;
        };
        Update: {
          commission_rate?: number | null;
          company_id?: string;
          created_at?: string;
          id?: string;
          rep_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rep_company_assignments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rep_company_assignments_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "reps";
            referencedColumns: ["id"];
          },
        ];
      };
      rep_rate_history: {
        Row: {
          commission_method: string;
          commission_rate: number;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          id: string;
          rep_id: string;
        };
        Insert: {
          commission_method: string;
          commission_rate: number;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          rep_id: string;
        };
        Update: {
          commission_method?: string;
          commission_rate?: number;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          rep_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rep_rate_history_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "reps";
            referencedColumns: ["id"];
          },
        ];
      };
      reps: {
        Row: {
          commission_method: string;
          commission_rate: number;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          commission_method?: string;
          commission_rate?: number;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          commission_method?: string;
          commission_rate?: number;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          address: string | null;
          code: string;
          contact_person: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
          zoho_contact_id: string | null;
        };
        Insert: {
          address?: string | null;
          code: string;
          contact_person?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          zoho_contact_id?: string | null;
        };
        Update: {
          address?: string | null;
          code?: string;
          contact_person?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          zoho_contact_id?: string | null;
        };
        Relationships: [];
      };
      team_action_items: {
        Row: {
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          due_at: string | null;
          entity_id: string | null;
          id: string;
          priority: string;
          status: string;
          title: string;
          updated_at: string;
          workspace: string;
        };
        Insert: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          due_at?: string | null;
          entity_id?: string | null;
          id?: string;
          priority?: string;
          status?: string;
          title: string;
          updated_at?: string;
          workspace?: string;
        };
        Update: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          due_at?: string | null;
          entity_id?: string | null;
          id?: string;
          priority?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          workspace?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_action_items_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_action_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string | null;
        };
        Relationships: [];
      };
      zoho_document_cache: {
        Row: {
          document_id: string;
          document_type: string;
          organization_id: string;
          payload: Json;
          payload_hash: string;
          source_modified_at: string | null;
          synced_at: string;
        };
        Insert: {
          document_id: string;
          document_type: string;
          organization_id: string;
          payload: Json;
          payload_hash: string;
          source_modified_at?: string | null;
          synced_at?: string;
        };
        Update: {
          document_id?: string;
          document_type?: string;
          organization_id?: string;
          payload?: Json;
          payload_hash?: string;
          source_modified_at?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      zoho_sync_locks: {
        Row: {
          lock_key: string;
          locked_until: string;
          updated_at: string;
        };
        Insert: {
          lock_key: string;
          locked_until: string;
          updated_at?: string;
        };
        Update: {
          lock_key?: string;
          locked_until?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      zoho_sync_log: {
        Row: {
          completed_at: string | null;
          error_message: string | null;
          id: string;
          items_synced: number | null;
          started_at: string;
          status: string;
          sync_type: string;
        };
        Insert: {
          completed_at?: string | null;
          error_message?: string | null;
          id?: string;
          items_synced?: number | null;
          started_at?: string;
          status?: string;
          sync_type: string;
        };
        Update: {
          completed_at?: string | null;
          error_message?: string | null;
          id?: string;
          items_synced?: number | null;
          started_at?: string;
          status?: string;
          sync_type?: string;
        };
        Relationships: [];
      };
      zoho_tokens: {
        Row: {
          access_token: string;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          organization_id: string | null;
          refresh_token: string;
          scope: string | null;
          token_type: string | null;
          updated_at: string;
        };
        Insert: {
          access_token: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          organization_id?: string | null;
          refresh_token: string;
          scope?: string | null;
          token_type?: string | null;
          updated_at?: string;
        };
        Update: {
          access_token?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          organization_id?: string | null;
          refresh_token?: string;
          scope?: string | null;
          token_type?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      zoho_webhook_events: {
        Row: {
          dedupe_key: string;
          document_id: string;
          document_type: string;
          error_message: string | null;
          event_type: string | null;
          id: string;
          operation: string | null;
          payload: Json;
          processed_at: string | null;
          received_at: string;
          status: string;
        };
        Insert: {
          dedupe_key: string;
          document_id: string;
          document_type: string;
          error_message?: string | null;
          event_type?: string | null;
          id?: string;
          operation?: string | null;
          payload?: Json;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
        };
        Update: {
          dedupe_key?: string;
          document_id?: string;
          document_type?: string;
          error_message?: string | null;
          event_type?: string | null;
          id?: string;
          operation?: string | null;
          payload?: Json;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_edit_commission: { Args: { _user_id: string }; Returns: boolean };
      get_current_user_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      get_invitation_by_token: {
        Args: { _token: string };
        Returns: {
          company_code: string;
          company_id: string;
          company_name: string;
          email: string;
          expires_at: string;
          id: string;
          status: string;
        }[];
      };
      get_unread_updates_count: {
        Args: { order_uuid: string; user_uuid: string };
        Returns: number;
      };
      get_user_role: {
        Args: { user_uuid: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      get_user_role_safe: {
        Args: { user_uuid: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      get_user_role_simple: {
        Args: { user_uuid: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
      is_user_approved: { Args: { user_uuid: string }; Returns: boolean };
      mark_order_update_as_read: {
        Args: { update_id: string; user_uuid: string };
        Returns: undefined;
      };
      release_zoho_sync_lock: {
        Args: { requested_key: string };
        Returns: undefined;
      };
      resolve_rep_for_company_as_of: {
        Args: { _as_of: string; _company_id: string };
        Returns: {
          commission_rate: number;
          rep_id: string;
        }[];
      };
      resolve_rep_rate_as_of: {
        Args: { _as_of: string; _rep_id: string };
        Returns: {
          commission_method: string;
          commission_rate: number;
        }[];
      };
      try_acquire_zoho_sync_lock: {
        Args: { lease_seconds?: number; requested_key: string };
        Returns: boolean;
      };
      validate_company_code: {
        Args: { company_code: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;
