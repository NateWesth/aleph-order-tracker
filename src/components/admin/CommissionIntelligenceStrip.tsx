import { AlertTriangle, BrainCircuit, ShieldCheck, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function CommissionIntelligenceStrip({ data }: { data: any }) {
  const lines: any[] = [];
  for (const rep of data?.reps || []) for (const inv of rep?.invoices || []) for (const li of inv?.line_items || inv?.items || []) lines.push(li);
  const low = lines.filter(li => li.margin_percent != null && Number(li.margin_percent) < 15);
  const negative = lines.filter(li => li.margin_percent != null && Number(li.margin_percent) < 0);
  const missing = lines.filter(li => li.cost == null || Number(li.cost) <= 0 || li.excluded_reason === "zero_cost" || li.excluded_reason === "unknown_cost");
  const riskyRevenue = low.reduce((sum, li) => sum + Number(li.sub_total || 0), 0);
  return <Card className="border-primary/15 bg-gradient-to-r from-primary/[.04] via-card to-card"><CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary"/><p className="text-sm font-black">Margin guardrails</p><Badge variant="secondary">live</Badge></div><p className="mt-1 text-xs text-muted-foreground">Flags low-margin sales, below-cost lines and missing costs before they quietly distort commission or profit.</p></div><div className="flex flex-wrap gap-2"><Signal icon={AlertTriangle} value={low.length} label="Below 15%" danger={low.length>0}/><Signal icon={TrendingDown} value={negative.length} label="Below cost" danger={negative.length>0}/><Signal icon={ShieldCheck} value={missing.length} label="Missing cost" danger={missing.length>0}/><div className="rounded-full border border-border/55 bg-background/70 px-3 py-1.5 text-xs font-bold">Risky revenue R{Math.round(riskyRevenue).toLocaleString("en-ZA")}</div><Button size="sm" variant="outline" className="rounded-full" onClick={()=>window.dispatchEvent(new CustomEvent("setActiveView",{detail:"intelligence"}))}>Investigate</Button></div></CardContent></Card>;
}
function Signal({icon:Icon,value,label,danger}:{icon:any;value:number;label:string;danger?:boolean}){return <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${danger?"border-red-500/25 bg-red-500/8 text-red-700":"border-border/55 bg-background/70"}`}><Icon className="h-3.5 w-3.5"/><strong>{value}</strong><span>{label}</span></div>}
