import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { buildTextPdf, emailRow, emptyRow, firstName, operationalEmail, sendOperationalEmail, shortDate, zaDate } from "../_shared/operational-email.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const dataOf=(result:PromiseSettledResult<any>)=>result.status==="fulfilled"?(result.value.data||[]):[];
const company=(order:any)=>order.companies?.name||"Customer not linked";
function sastRange(){const shifted=new Date(Date.now()+2*3600000);shifted.setUTCHours(0,0,0,0);const start=new Date(shifted.getTime()-2*3600000);return {start,end:new Date(start.getTime()+86400000)};}

serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});
  try{
    const supabase=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");const key=Deno.env.get("MAILGUN_API_KEY"),domain=Deno.env.get("MAILGUN_DOMAIN");if(!key||!domain)return json({error:"Mailgun is not configured"},500);
    const {data:recipients,error}=await supabase.from("profiles").select("id,email,full_name").eq("daily_afternoon_report",true).eq("approved",true);if(error)throw error;if(!recipients?.length)return json({message:"No opted-in recipients",sent:0});
    const {start,end}=sastRange();const tomorrow=new Date(end.getTime()+86400000);
    const results=await Promise.allSettled([
      supabase.from("orders").select("id,order_number,status,urgency,assigned_to,fulfillment_assigned_to,completed_date,fulfillment_scheduled_for,companies(name)").gte("completed_date",start.toISOString()).lt("completed_date",end.toISOString()).order("completed_date",{ascending:false}),
      supabase.from("orders").select("id,order_number,status,urgency,assigned_to,fulfillment_assigned_to,created_at,fulfillment_scheduled_for,companies(name)").neq("status","delivered").order("created_at",{ascending:false}).limit(500),
      supabase.from("order_activity_log").select("id,title,description,activity_type,order_id,created_at").gte("created_at",start.toISOString()).lt("created_at",end.toISOString()).order("created_at",{ascending:false}).limit(100),
      supabase.from("return_cases").select("id,rma_number,client_name,item_description,status,priority,due_date,assigned_to").not("status","in","(completed,rejected)").order("due_date"),
      supabase.from("loan_assets").select("id,asset_code,tool_name,borrower_name,due_back_at,returned_at,responsible_user_id").is("returned_at",null).order("due_back_at"),
      supabase.from("calibration_assets").select("id,asset_code,tool_name,next_due_on,status,responsible_user_id").neq("status","retired").order("next_due_on"),
      supabase.from("team_action_items").select("id,title,status,priority,due_at,assigned_to,workspace").neq("status","done").order("due_at"),
      supabase.from("repair_tickets").select("id,ticket_number,client,status,deadline_date,assigned_to").not("status","in","(completed,scrapped)").order("deadline_date"),
      supabase.from("sharpening_jobs").select("id,job_number,customer_name,status,deadline_date,assigned_to").neq("status","completed").order("deadline_date"),
    ]);
    const [completed,active,activity,returns,loans,calibrations,tasks,repairs,sharpening]=results.map(dataOf);const urgent=active.filter((o:any)=>o.urgency==="urgent");const scheduledTomorrow=active.filter((o:any)=>o.fulfillment_scheduled_for&&new Date(o.fulfillment_scheduled_for)>=end&&new Date(o.fulfillment_scheduled_for)<tomorrow);const now=Date.now();const serviceDue=[...loans.filter((x:any)=>new Date(x.due_back_at).getTime()<now).map((x:any)=>({ref:x.asset_code,detail:`Loan with ${x.borrower_name} · ${x.tool_name}`,owner:x.responsible_user_id,type:"loan"})),...calibrations.filter((x:any)=>x.status==="due"||x.status==="expired").map((x:any)=>({ref:x.asset_code,detail:`Calibration ${shortDate(x.next_due_on)} · ${x.tool_name}`,owner:x.responsible_user_id,type:"calibration"}))];
    const handover=[...repairs.map((x:any)=>({ref:x.ticket_number,detail:`Repair · ${x.client}`,deadline:x.deadline_date,owner:x.assigned_to})),...sharpening.map((x:any)=>({ref:x.job_number,detail:`Sharpening · ${x.customer_name}`,deadline:x.deadline_date,owner:x.assigned_to}))].filter((x:any)=>x.deadline&&new Date(x.deadline).getTime()<tomorrow.getTime());
    const day=zaDate();let sent=0,failed=0;
    for(const recipient of recipients){if(!recipient.email)continue;const myWork=[...active.filter((o:any)=>o.assigned_to===recipient.id||o.fulfillment_assigned_to===recipient.id).map((o:any)=>({ref:o.order_number,detail:`${company(o)} · ${o.urgency||o.status}`})),...tasks.filter((t:any)=>t.assigned_to===recipient.id).map((t:any)=>({ref:t.title,detail:`${t.workspace||"Task"}${t.due_at?` · due ${shortDate(t.due_at)}`:""}`})),...returns.filter((r:any)=>r.assigned_to===recipient.id).map((r:any)=>({ref:r.rma_number,detail:`Return · ${r.client_name}`})),...serviceDue.filter((s:any)=>s.owner===recipient.id)];
      const carry=urgent.length+serviceDue.length+handover.length;
      const html=operationalEmail({eyebrow:"Afternoon handover",title:carry?`${carry} items carry forward`:"Today is closed cleanly",date:day,greeting:`Good afternoon, ${firstName(recipient.full_name)}.`,intro:`The team completed ${completed.length} order${completed.length===1?"":"s"} and recorded ${activity.length} operational change${activity.length===1?"":"s"} today. Here is the concise handover for what remains.`,metrics:[{label:"Completed",value:completed.length,tone:"cyan"},{label:"Changes",value:activity.length,tone:"violet"},{label:"Urgent open",value:urgent.length,tone:"magenta"},{label:"Tomorrow",value:scheduledTomorrow.length,tone:"amber"}],sections:[
        {title:"Today’s wins",subtitle:"Confirmed completed orders",accent:"#11b7c9",html:completed.slice(0,8).map((o:any)=>emailRow(o.order_number,company(o),"completed","#11b7c9")).join("")||emptyRow("No orders were marked complete today")},
        {title:"Your handover",subtitle:"Open work assigned directly to you",accent:"#7155d9",html:myWork.slice(0,8).map((x:any)=>emailRow(x.ref,x.detail,"assigned")).join("")||emptyRow("You have no directly assigned carry-over work")},
        {title:"Team carry-over",subtitle:"Urgent work, service exceptions and workshop deadlines",accent:"#d82d87",html:[...urgent.slice(0,5).map((o:any)=>emailRow(o.order_number,company(o),"urgent","#d82d87")),...serviceDue.slice(0,5).map((x:any)=>emailRow(x.ref,x.detail,x.type,"#e69a18")),...handover.slice(0,5).map((x:any)=>emailRow(x.ref,`${x.detail} · ${shortDate(x.deadline)}`,"deadline","#d82d87"))].join("")||emptyRow("No urgent or overdue work carries forward")},
        {title:"Tomorrow’s dispatch",subtitle:"Confirmed fulfillment scheduled for the next business day",accent:"#e69a18",html:scheduledTomorrow.slice(0,8).map((o:any)=>emailRow(o.order_number,`${company(o)} · ${shortDate(o.fulfillment_scheduled_for)}`,"scheduled","#e69a18")).join("")||emptyRow("Nothing is scheduled for tomorrow yet")},
      ],ctaLabel:"Review My Work",ctaPath:"/admin",footerNote:"Afternoon handover · based on confirmed records, not speculative AI scoring"});
      const pdf=buildTextPdf(`ALEPH AFTERNOON HANDOVER - ${day}`,[`Completed: ${completed.length} | Changes: ${activity.length} | Urgent open: ${urgent.length} | Tomorrow: ${scheduledTomorrow.length}`,"",...completed.slice(0,15).map((o:any)=>`COMPLETED ${o.order_number} ${company(o)}`),...urgent.slice(0,15).map((o:any)=>`URGENT ${o.order_number} ${company(o)}`),...myWork.slice(0,15).map((x:any)=>`ASSIGNED ${x.ref} ${x.detail}`)]);
      try{await sendOperationalEmail(domain,key,recipient.email,carry?`Afternoon handover · ${carry} carry forward`:`Afternoon handover · Clear close`,html,pdf,`aleph-handover-${new Date().toISOString().slice(0,10)}.pdf`);sent++;}catch(err){console.error("Afternoon email failed",recipient.id,err);failed++;}
    }
    return json({sent,failed,recipients:recipients.length,summary:{completed:completed.length,activity:activity.length,urgent:urgent.length}});
  }catch(error){console.error("Afternoon report error",error);return json({error:error instanceof Error?error.message:"Unexpected afternoon report error"},500);}
});
