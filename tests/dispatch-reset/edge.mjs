import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const source=await readFile(new URL("../../supabase/functions/dispatch-sync/index.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source.replace(/^import.*\n/,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const now=()=>new Date().toISOString();
async function scenario({kind="delivery",approved=true,authenticated=true,fail=false,locked=false,cached=false,more=false,old=false,candidate=false,missing=false}={}){
 const state={kind,next_page:1,scanned:0,last_attempt_at:null,last_success_at:null,error:null};
 const doc={invoice_id:"I1",purchaseorder_id:"P1",created_time:"2026-09-14T00:00:00+0200",last_modified_time:"2026-09-16T08:00:00+0200",status:"paid",line_items:[]};
 const calls=[],writes=[],ingests=[];let handler;
 const data={profiles:[{id:"staff",approved}],dispatch_sync_state:[state],zoho_tokens:[{id:"00000000-0000-0000-0000-000000000001",organization_id:"org",access_token:"FAKE",expires_at:"2099-01-01"}],zoho_document_cache:cached?[{document_id:kind==="delivery"?"I1":"P1",payload:doc}]:[],dispatch_documents:candidate?[{id:"delivery:org:UNSEEN",source_id:"UNSEEN"}]:[]};
 const db={auth:{getUser:async()=>({data:{user:authenticated?{id:"staff"}:null},error:null})},
 rpc:async(name,args)=>{if(name==="try_acquire_zoho_sync_lock")return{data:!locked,error:null};if(name==="ingest_dispatch_document")ingests.push(args);return{data:{},error:null};},
 from(table){let patch,op="read",single=false;const q={select(){return q},eq(){return q},in(){return q},lt(){return q},order(){return q},limit(){return q},not(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},update(value){patch=value;op="update";return q},upsert(value){patch=value;op="upsert";return q},then(resolve){if(op!=="read"){writes.push({table,patch});if(table==="dispatch_sync_state")Object.assign(state,patch);}return Promise.resolve(resolve({data:single?data[table]?.[0]:data[table]||[],error:null}));}};return q;}
 };
 const context=vm.createContext({Deno:{serve(fn){handler=fn},env:{get:()=>"test"}},createClient:()=>db,Response,Request,URL,URLSearchParams,TextEncoder,AbortSignal,crypto,setTimeout,clearTimeout,console,
 fetch:async(input)=>{const url=new URL(input);calls.push(url);assert.equal(url.searchParams.get("organization_id"),"org");
 if(missing&&url.pathname.endsWith("/UNSEEN"))return Response.json({code:1002,message:"Invoice does not exist."},{status:400});
 const module=kind==="delivery"?"invoices":"purchaseorders";if(url.pathname.endsWith("/"+module)){
 assert.equal(url.searchParams.get("created_date_start"),"2026-09-13");assert.equal(url.searchParams.get("sort_column"),"created_time");
 return Response.json({code:0,[module]:[{...doc,created_time:old?"2026-03-09T00:00:00+0200":doc.created_time}],page_context:{has_more_page:more}});
 }if(fail)return Response.json({code:1,message:"Source unavailable"},{status:500});
 return Response.json({code:0,[kind==="delivery"?"invoice":"purchaseorder"]:doc});}
 });
 // Use real default endpoints; no credentials or network are involved.
 context.Deno.env.get=name=>name==="ZOHO_API_URL"||name==="ZOHO_ACCOUNTS_URL"?undefined:"test";
 vm.runInContext(js,context);
 const response=await handler(new Request("http://test",{method:"POST",headers:{Authorization:"Bearer test"},body:JSON.stringify({kind})}));
 return {response,body:await response.json(),calls,writes,ingests,state};
}
let result=await scenario();assert.equal(result.response.status,200);assert.equal(result.ingests[0].p_type,"invoice");assert.equal(result.calls.length,2);assert(result.state.last_success_at);
result=await scenario({kind:"collection"});assert.equal(result.ingests[0].p_type,"purchase_order");
result=await scenario({cached:true});assert.equal(result.calls.length,1,"unchanged cached detail must not be reread");assert.equal(result.ingests.length,1);
result=await scenario({fail:true});assert.equal(result.response.status,502);assert.equal(result.state.next_page,1);assert.equal(result.state.last_success_at,null);assert(!result.writes.some(w=>w.patch.source_status==="missing-in-zoho"),"no disappearance reconciliation after a failed page");
result=await scenario({more:true});assert.equal(result.state.next_page,2);assert.equal(result.state.last_success_at,null);
result=await scenario({old:true});assert.equal(result.ingests.length,0);assert.equal(result.calls.length,1);
result=await scenario({approved:false});assert.equal(result.response.status,403);assert.equal(result.calls.length,0);
result=await scenario({authenticated:false});assert.equal(result.response.status,401);
result=await scenario({locked:true});assert.equal(result.body.syncing,true);assert.equal(result.calls.length,0);
result=await scenario({candidate:true});assert(!result.writes.some(w=>w.patch.source_status==="missing-in-zoho"),"shifted pagination must not hide existing documents");
result=await scenario({candidate:true,missing:true});assert(result.writes.some(w=>w.patch.source_status==="missing-in-zoho"));
console.log("PASS: edge handler authentication, both Zoho sources, creation filters, cache reuse, failed-page retry, pagination, old-document exclusion and overlap lock (mocked HTTP, no live Zoho calls).");
