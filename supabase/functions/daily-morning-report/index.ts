import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { buildTextPdf, emailRow, emptyRow, firstName, operationalEmail, sendOperationalEmail, shortDate, zaDate } from "../_shared/operational-email.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const dataOf=(result:PromiseSettledResult<any>)=>result.status==="fulfilled"?(result.value.data||[]):[];
const company=(order:any)=>order.companies?.name||"Customer not linked";
const ageDays=(value:string)=>Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86400000));

serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});
  try{
    const supabase=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
    const key=Deno.env.get("MAILGUN_API_KEY"),domain=Deno.env.get("MAILGUN_DOMAIN");if(!key||!domain)return json({error:"Mailgun is not configured"},500);
    const {data:recipients,error}=await supabase.from("profiles").select("id,email,full_name").eq("daily_morning_report",true).eq("approved",true);
    if(error)throw error;if(!recipients?.length)return json({message:"No opted-in recipients",sent:0});

    const results=await Promise.allSettled([
      supabase.from("orders").select("id,order_number,status,urgency,description,created_at,assigned_to,fulfillment_status,companies(name)").neq("status","delivered").order("created_at",{ascending:false}).limit(500),
      supabase.from("order_items").select("id,order_id,name,code,description,quantity,stock_status,qty_on_po,qty_received,qty_invoiced,qty_completed"),
      supabase.from("order_purchase_orders").select("order_id,purchase_order_number"),
      supabase.from("return_cases").select("id,rma_number,client_name,item_description,status,priority,due_date").not("status","in","(completed,rejected)").order("due_date"),
      supabase.from("loan_assets").select("id,asset_code,tool_name,borrower_name,due_back_at,returned_at").is("returned_at",null).order("due_back_at"),
      supabase.from("calibration_assets").select("id,asset_code,tool_name,next_due_on,status").neq("status","retired").order("next_due_on"),
      supabase.from("sharpening_jobs").select("id,job_number,customer_name,status,priority,deadline_date").neq("status","completed").order("deadline_date"),
      supabase.from("repair_tickets").select("id,ticket_number,client,status,priority,deadline_date,is_warranty").not("status","in","(completed,scrapped)").order("deadline_date"),
    ]);
    const [orders,items,pos,returns,loans,calibrations,sharpening,repairs]=results.map(dataOf);
    const urgent=orders.filter((o:any)=>o.urgency==="urgent");
    const stale=orders.filter((o:any)=>o.created_at&&ageDays(o.created_at)>=14);
    const ready=orders.filter((o:any)=>o.status==="ready"||o.fulfillment_status==="ready"||items.some((i:any)=>i.order_id===o.id&&Number(i.qty_invoiced)>Number(i.qty_completed)));
    const missingStock=orders.filter((o:any)=>items.some((i:any)=>i.order_id===o.id&&Number(i.qty_on_po)<Number(i.quantity)));
    const now=Date.now();const overdueLoans=loans.filter((x:any)=>new Date(x.due_back_at).getTime()<now);const dueCalibration=calibrations.filter((x:any)=>x.status==="due"||x.status==="expired"||new Date(x.next_due_on).getTime()<now+30*86400000);
    const overdueWorkshop=[...sharpening.map((x:any)=>({...x,ref:x.job_number,client:x.customer_name,type:"Sharpening"})),...repairs.map((x:any)=>({...x,ref:x.ticket_number,type:x.is_warranty?"Warranty repair":"Repair"}))].filter((x:any)=>x.deadline_date&&new Date(x.deadline_date).getTime()<now);
    const attention=urgent.length+overdueLoans.length+dueCalibration.length+overdueWorkshop.length;
    const orderRow=(o:any)=>{const lineCount=items.filter((i:any)=>i.order_id===o.id).length;const po=pos.filter((p:any)=>p.order_id===o.id).map((p:any)=>p.purchase_order_number).join(", ");return emailRow(o.order_number,`${company(o)} · ${lineCount} line${lineCount===1?"":"s"}${po?` · PO ${po}`:""}`,o.urgency||o.status,o.urgency==="urgent"?"#d82d87":"#7155d9")};
    const day=zaDate();let sent=0,failed=0;
    for(const recipient of recipients){if(!recipient.email)continue;
      const html=operationalEmail({eyebrow:"Morning operations brief",title:attention?`${attention} items need attention`:"A clear start to the day",date:day,greeting:`Good morning, ${firstName(recipient.full_name)}.`,intro:attention?"Here is the confirmed work that needs attention first. Routine records stay out of the way so the team can act quickly.":"There are no urgent cross-workspace exceptions this morning. The active pipeline is summarised below.",metrics:[{label:"Open orders",value:orders.length,tone:"violet"},{label:"Urgent",value:urgent.length,tone:"magenta"},{label:"Ready",value:ready.length,tone:"cyan"},{label:"Service due",value:overdueLoans.length+dueCalibration.length,tone:"amber"}],sections:[
        {title:"Act first",subtitle:"Urgent orders and work already past its commitment",accent:"#d82d87",html:[...urgent.slice(0,5).map(orderRow),...overdueWorkshop.slice(0,4).map((x:any)=>emailRow(x.ref,`${x.type} · ${x.client} · deadline ${shortDate(x.deadline_date)}`,"overdue","#d82d87"))].join("")||emptyRow("No urgent or overdue operational work")},
        {title:"Assets requiring control",subtitle:"Loan returns and calibration deadlines",accent:"#e69a18",html:[...overdueLoans.slice(0,4).map((x:any)=>emailRow(x.asset_code,`${x.tool_name} · with ${x.borrower_name} · due ${shortDate(x.due_back_at)}`,"loan overdue","#e69a18")),...dueCalibration.slice(0,4).map((x:any)=>emailRow(x.asset_code,`${x.tool_name} · calibration ${shortDate(x.next_due_on)}`,x.status,"#e69a18"))].join("")||emptyRow("No loan or calibration exceptions")},
        {title:"Pipeline to unlock",subtitle:"Purchasing gaps and delivery-ready work",accent:"#11b7c9",html:[...missingStock.slice(0,4).map(orderRow),...ready.slice(0,4).map(orderRow)].join("")||emptyRow("No blocked or delivery-ready orders")},
        ...(returns.length?[{title:"Open customer returns",subtitle:"RMA cases still requiring a resolution",accent:"#7155d9",html:returns.slice(0,5).map((x:any)=>emailRow(x.rma_number,`${x.client_name} · ${x.item_description} · due ${shortDate(x.due_date)}`,x.status)).join("")}]:[]),
      ],ctaLabel:"Open My Work",ctaPath:"/admin",footerNote:"Morning brief · routine detail is available in Aleph when needed"});
      const pdf=buildTextPdf(`ALEPH MORNING BRIEF - ${day}`,[`Open orders: ${orders.length} | Urgent: ${urgent.length} | Ready: ${ready.length} | 14+ days: ${stale.length}`,"",...urgent.slice(0,15).map((o:any)=>`URGENT  ${o.order_number}  ${company(o)}`),...overdueWorkshop.slice(0,15).map((x:any)=>`OVERDUE ${x.type} ${x.ref} ${x.client}`),...overdueLoans.slice(0,10).map((x:any)=>`LOAN DUE ${x.asset_code} ${x.borrower_name}`)]);
      try{await sendOperationalEmail(domain,key,recipient.email,attention?`Morning brief · ${attention} need attention`:`Morning brief · Operations clear`,html,pdf,`aleph-morning-${new Date().toISOString().slice(0,10)}.pdf`);sent++;}catch(err){console.error("Morning email failed",recipient.id,err);failed++;}
    }
    return json({sent,failed,recipients:recipients.length,summary:{orders:orders.length,attention}});
  }catch(error){console.error("Morning report error",error);return json({error:error instanceof Error?error.message:"Unexpected morning report error"},500);}
});
