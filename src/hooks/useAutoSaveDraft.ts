import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
export interface OrderDraft {
  requestId?: string;
  orderNumber?: string;
  companyId: string;
  urgency: string;
  items: Array<{ id: string; name: string; code: string; description?: string; quantity: number }>;
  purchaseOrders: Array<{ id: string; supplierId: string; purchaseOrderNumber: string }>;
  savedAt: number;
}


export function useAutoSaveDraft() {
  const {user}=useAuth();
  const key=user?.id?"aleph:order-draft:v2:"+user.id:null;
  const [draftStatus,setDraftStatus]=useState("");
  const loadDraft=useCallback(():OrderDraft|null=>{
    if(!key)return null;
    try{const draft=JSON.parse(localStorage.getItem(key)||"null");return draft&&Number.isFinite(draft.savedAt)&&Date.now()-draft.savedAt<7*86400000?draft:null;}catch{return null;}
  },[key]);
  const saveDraft=useCallback((draft:Omit<OrderDraft,"savedAt">)=>{
    if(!key)return;
    try{localStorage.setItem(key,JSON.stringify({...draft,savedAt:Date.now()}));setDraftStatus("Draft saved on this device — not yet saved to the team");}
    catch{setDraftStatus("Draft not protected: device storage unavailable. Keep this form open.");}
  },[key]);
  const clearDraft=useCallback(()=>{if(key){try{localStorage.removeItem(key);setDraftStatus("");}catch{setDraftStatus("Could not clear the device draft");}}},[key]);
  const hasDraft=useCallback(()=>loadDraft()!==null,[loadDraft]);
  return {loadDraft,saveDraft,clearDraft,hasDraft,draftStatus};
}
