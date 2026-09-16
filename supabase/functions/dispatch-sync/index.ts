import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const START = Date.parse("2026-09-14T00:00:00+02:00");
const TOKEN_ID = "00000000-0000-0000-0000-000000000001";
function stable(value:any):string{
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stable(value[key])).join(",")+"}";
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
async function checked(query: any) { const result = await query; if (result.error) throw result.error; return result.data; }

Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response(null, { headers: cors });
 if (req.method !== "POST") return json({error:"POST required"},405);
 const db = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 let lock = ""; let acquired = false; let kind = "";
 try {
  const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  const {data:auth,error:authError}=await db.auth.getUser(bearer);
  if(authError||!auth.user)return json({error:"Sign in required"},401);
  const profile=await checked(db.from("profiles").select("approved").eq("id",auth.user.id).maybeSingle());
  if(!profile?.approved)return json({error:"Approved staff account required"},403);
  const body=await req.json();kind=body.kind;
  if(!["collection","delivery"].includes(kind))return json({error:"Invalid source kind"},400);
  lock="fresh-dispatch:"+kind;
  acquired=await checked(db.rpc("try_acquire_zoho_sync_lock",{requested_key:lock,lease_seconds:180}))===true;
  if(!acquired)return json({syncing:true,hasMore:true,retryAfter:3});
  const state=await checked(db.from("dispatch_sync_state").select("*").eq("kind",kind).single());
  const successAge=Date.now()-Date.parse(state.last_success_at||"");
  const attemptAge=Date.now()-Date.parse(state.last_attempt_at||"");
  if(state.next_page===1 && !state.error && successAge<300000 && body.refresh!==true)
   return json({cached:true,hasMore:false,lastSuccess:state.last_success_at});
  if(state.next_page===1 && attemptAge<30000)
   return json({cached:true,hasMore:false,lastSuccess:state.last_success_at,warning:state.error||null,retryAfter:Math.ceil((30000-attemptAge)/1000)});
  const cycleStart=state.next_page===1?new Date().toISOString():state.cycle_started_at;
  await checked(db.from("dispatch_sync_state").update({last_attempt_at:new Date().toISOString(),cycle_started_at:cycleStart,error:null}).eq("kind",kind));
  const token=await checked(db.from("zoho_tokens").select("*").eq("id",TOKEN_ID).single());
  if(!token.organization_id)throw new Error("Connect your Zoho Books organization in Settings.");
  let access=token.access_token;
  if(!access||!Number.isFinite(Date.parse(token.expires_at||""))||Date.parse(token.expires_at)<Date.now()+120000) {
   const clientId=Deno.env.get("ZOHO_CLIENT_ID"),secret=Deno.env.get("ZOHO_CLIENT_SECRET");
   if(!clientId||!secret)throw new Error("Zoho OAuth credentials are not configured.");
   const response=await fetch((Deno.env.get("ZOHO_ACCOUNTS_URL")||"https://accounts.zoho.com")+"/oauth/v2/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},signal:AbortSignal.timeout(15000),
    body:new URLSearchParams({refresh_token:token.refresh_token,client_id:clientId,client_secret:secret,grant_type:"refresh_token"})
   });
   const fresh=await response.json();
   if(!response.ok||!fresh.access_token)throw new Error("Zoho authorization expired. Reconnect Zoho Books in Settings.");
   access=fresh.access_token;
   await checked(db.from("zoho_tokens").update({access_token:access,expires_at:new Date(Date.now()+Number(fresh.expires_in||3600)*1000).toISOString()}).eq("id",TOKEN_ID));
  }
  const base=(Deno.env.get("ZOHO_API_URL")||"https://www.zohoapis.com").replace(/\/$/,"");
  async function zoho(path:string,params:Record<string,string>={},allowMissing=false) {
   const url=new URL(base+"/books/v3/"+path);
   url.search=new URLSearchParams({organization_id:token.organization_id,...params}).toString();
   for(let attempt=0;attempt<2;attempt++){
    const response=await fetch(url,{headers:{Authorization:"Zoho-oauthtoken "+access},signal:AbortSignal.timeout(12000)});
    const result=await response.json();
    if(response.ok&&result.code===0)return result;
    if(allowMissing&&result.code===1002&&/does not exist/i.test(String(result.message)))return null;
    if(response.status===429&&attempt===0){await new Promise(resolve=>setTimeout(resolve,1000));continue;}
    throw new Error("Zoho "+path.split("/")[0]+" failed: "+String(result.message||response.status));
   }
   throw new Error("Zoho request failed");
  }
  const module=kind==="collection"?"purchaseorders":"invoices";
  const type=kind==="collection"?"purchase_order":"invoice";
  const idField=kind==="collection"?"purchaseorder_id":"invoice_id";
  const detailField=kind==="collection"?"purchaseorder":"invoice";
  // Widen provider date filtering by one day for organization timezone differences.
  // The exact South African creation instant is enforced again by the database.
  const list=await zoho(module,{created_date_start:"2026-09-13",sort_column:"created_time",sort_order:"D",per_page:"20",page:String(state.next_page)});
  if(!Array.isArray(list[module]))throw new Error("Zoho returned an invalid document list.");
  const summaries=list[module].filter((row:any)=>!row.created_time||!Number.isFinite(Date.parse(row.created_time))||Date.parse(row.created_time)>=START);
  const ids=summaries.map((row:any)=>String(row[idField]));
  const cached=ids.length?await checked(db.from("zoho_document_cache").select("document_id,payload").eq("organization_id",token.organization_id).eq("document_type",type).in("document_id",ids)):[];
  const byId=new Map(cached.map((row:any)=>[row.document_id,row.payload]));
  for(let offset=0;offset<summaries.length;offset+=4){
   const results=await Promise.allSettled(summaries.slice(offset,offset+4).map(async(summary:any)=>{
    const id=String(summary[idField]||"");if(!id)throw new Error("Zoho returned a document without an ID.");
    const previous:any=byId.get(id);
    let document=previous;
    if(!previous||!summary.last_modified_time||previous.last_modified_time!==summary.last_modified_time){
     document=(await zoho(module+"/"+encodeURIComponent(id)))[detailField];
     if(!document)throw new Error("Zoho detail missing for "+id);
    }
    // This import is independent of local orders/references/SKU matching.
    await checked(db.rpc("ingest_dispatch_document",{p_org:token.organization_id,p_type:type,p_doc:document}));
    const created=Date.parse(document.created_time);
    if(!Number.isFinite(created))throw new Error("Missing creation time for "+id);
    if(created<START)return;
    if(document!==previous){
     const bytes=new TextEncoder().encode(stable(document));
     const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(v=>v.toString(16).padStart(2,"0")).join("");
     await checked(db.from("zoho_document_cache").upsert({organization_id:token.organization_id,document_type:type,document_id:id,payload:document,payload_hash:hash,source_modified_at:document.last_modified_time||document.created_time,synced_at:new Date().toISOString()}));
    }
    await checked(db.from("dispatch_documents").update({fetched_at:new Date().toISOString()}).eq("organization_id",token.organization_id).eq("kind",kind).eq("source_id",id));
   }));
   const failed=results.find(result=>result.status==="rejected") as PromiseRejectedResult|undefined;
   if(failed)throw failed.reason; // Keep this page's cursor; successful rows are safely reused on retry.
  }
  const reachedOld=list[module].some((row:any)=>Number.isFinite(Date.parse(row.created_time))&&Date.parse(row.created_time)<START);
  const more=!reachedOld&&(list.page_context?.has_more_page??list[module].length===20);
  if(!more){
   // Offset pages can shift while Zoho is edited. Never infer deletion just
   // because a row was absent from this scan: verify its detail endpoint first.
   // Bound repair reads; further candidates are checked on subsequent scans.
   const candidates=await checked(db.from("dispatch_documents").select("id,source_id").eq("organization_id",token.organization_id)
    .eq("kind",kind).eq("source_closed",false).lt("fetched_at",cycleStart).not("status","in","(completed,dismissed)").order("fetched_at").limit(4));
   const verified=await Promise.allSettled(candidates.map(async(candidate:any)=>{
    const detail=await zoho(module+"/"+encodeURIComponent(candidate.source_id),{},true);
    if(detail===null){
     await checked(db.from("dispatch_documents").update({source_closed:true,source_status:"missing-in-zoho",updated_at:new Date().toISOString()}).eq("id",candidate.id));
    }else{
     if(!detail[detailField])throw new Error("Missing source detail for "+candidate.source_id);
     await checked(db.rpc("ingest_dispatch_document",{p_org:token.organization_id,p_type:type,p_doc:detail[detailField]}));
     await checked(db.from("dispatch_documents").update({fetched_at:new Date().toISOString()}).eq("id",candidate.id));
    }
   }));
   const failure=verified.find(result=>result.status==="rejected") as PromiseRejectedResult|undefined;
   if(failure)throw failure.reason;
  }
  const now=new Date().toISOString();
  await checked(db.from("dispatch_sync_state").update({next_page:more?state.next_page+1:1,last_success_at:more?state.last_success_at:now,error:null,scanned:(state.next_page===1?0:state.scanned)+summaries.length}).eq("kind",kind));
  return json({hasMore:more,lastSuccess:more?state.last_success_at:now,imported:summaries.length});
 }catch(error){
  const message=error instanceof Error?error.message:String((error as any)?.message||"Dispatch sync failed");
  if(kind==="collection"||kind==="delivery")await db.from("dispatch_sync_state").update({error:message}).eq("kind",kind);
  return json({error:message},502);
 }finally{if(acquired)await db.rpc("release_zoho_sync_lock",{requested_key:lock});}
});
