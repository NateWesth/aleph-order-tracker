import { AlertTriangle, BrainCircuit, ShieldCheck, ShoppingCart, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BuyingSheetRow } from "./types";

export default function ProcurementIntelligenceStrip({rows}:{rows:BuyingSheetRow[]}){
  const buyNow=rows.filter(r=>r.toOrder>0&&(r.hasUrgent||r.priorityScore>=50));
  const duplicate=rows.filter(r=>r.toOrder>0&&r.onPurchaseOrder>0);
  const overdue=rows.filter(r=>r.toOrder>0&&r.daysWaiting>=7);
  const supplierRisk=rows.filter(r=>r.toOrder>0&&r.supplierReliability!=null&&r.supplierReliability<75);
  const openIntel=()=>window.dispatchEvent(new CustomEvent("setActiveView",{detail:"intelligence"}));
  return <Card className="border-primary/15 bg-gradient-to-r from-primary/[.035] via-card to-card shadow-sm"><CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary"/><p className="text-sm font-black">Purchasing intelligence</p><Badge variant="secondary">live guardrails</Badge></div><p className="mt-1 text-xs text-muted-foreground">Aleph is checking priority, duplicate PO exposure, supplier reliability and waiting age before you buy.</p></div><div className="flex flex-wrap gap-2"><Signal icon={ShoppingCart} value={buyNow.length} label="Buy now"/><Signal icon={AlertTriangle} value={duplicate.length} label="Duplicate risk" danger={duplicate.length>0}/><Signal icon={TrendingUp} value={overdue.length} label="Waiting 7d+" danger={overdue.length>0}/><Signal icon={ShieldCheck} value={supplierRisk.length} label="Supplier risk" danger={supplierRisk.length>0}/><Button size="sm" variant="outline" className="rounded-full" onClick={openIntel}>Open intelligence</Button></div></CardContent></Card>;
}
function Signal({icon:Icon,value,label,danger}:{icon:any;value:number;label:string;danger?:boolean}){return <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${danger?"border-amber-500/30 bg-amber-500/8 text-amber-800":"border-border/55 bg-background/70"}`}><Icon className="h-3.5 w-3.5"/><strong>{value}</strong><span>{label}</span></div>}
