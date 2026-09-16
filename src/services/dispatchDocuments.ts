import {supabase} from "@/integrations/supabase/client";
import {readAllRows} from "@/lib/readAllRows";
import {DISPATCH_FIELDS,DISPATCH_START,isActiveDispatch,type DispatchDocument} from "@/lib/dispatchDocuments";
export async function queryActiveDispatch(kind?:"collection"|"delivery",assignees?:string[]){
 try{
  const data=await readAllRows<DispatchDocument>((from,to)=>{
   let query=(supabase as any).from("dispatch_documents").select(DISPATCH_FIELDS).gte("source_created_at",DISPATCH_START).order("id").range(from,to);
   if(kind)query=query.eq("kind",kind);
   if(assignees)query=query.in("assigned_to",assignees);
   return query;
  });
  return {data:data.filter(isActiveDispatch),error:null};
 }catch(error:any){return {data:null,error:{message:error.message||"Dispatch unavailable"}};}
}
