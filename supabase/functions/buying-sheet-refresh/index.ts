import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { canStartRefresh, nextRefreshPage } from './rules.ts';
import { mergeInventory, readStock } from '../_shared/inventory.ts';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
async function checked(query:any){const {data,error}=await query;if(error)throw new Error(error.message);return data;}

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'POST required'},405);
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('ZOHO_WEBHOOK_SECRET');
 if(!url||!service||!anon||!secret)return json({error:'Refresh credentials unavailable'},503);
 const internal=req.headers.get('x-zoho-webhook-secret')===secret;
 if(!internal&&req.headers.get('apikey')!==anon)return json({error:'Unauthorized'},401);
 let body:any;try{body=await req.json();}catch{return json({error:'Invalid refresh request'},400);}
 if(body.action!=='scheduled_refresh'||Object.keys(body).some(key=>key!=='action'))return json({error:'Invalid refresh request'},400);
 const db=createClient(url,service);let acquired=false;
  const call=async(name:string)=>{
  const response=await fetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json','x-zoho-webhook-secret':secret},body:JSON.stringify({action:name==='buying-sheet-data'?'refresh_inventory':'scheduled_refresh'}),signal:AbortSignal.timeout(55000)});
  if(!response.ok)throw new Error(`${name} [${response.status}]: ${await response.text()}`);
 };
 let continueScan=false;
 try{
  acquired=await checked(db.rpc('try_acquire_zoho_sync_lock',{requested_key:'buying-scheduled-refresh',lease_seconds:180}))===true;
  if(!acquired)return json({busy:true},409);
  let state=await checked(db.from('buying_sync_state').select('*').eq('id',true).single());
  if(!internal){
   const resumeFailed=state.running&&Boolean(state.error);
   if(!resumeFailed&&!canStartRefresh(state.last_attempt_at,Date.now()))return json({skipped:true,lastSuccess:state.last_success_at});
   const now=new Date().toISOString();
   const patch={last_attempt_at:now,error:null,running:true,...(!state.running?{source:'purchase_order',next_page:1,cycle_started_at:now,inventory_data:{}}:{})};
   await checked(db.from('buying_sync_state').update(patch).eq('id',true));
   state={...state,...patch};
  }else if(!state.running)return json({complete:true});
  const token=await checked(db.from('zoho_tokens').select('*').eq('id','00000000-0000-0000-0000-000000000001').single());
  if(!token.organization_id)throw new Error('Zoho Books organization is not connected');
  let access=token.access_token;
  if(!access||!token.expires_at||Date.parse(token.expires_at)<Date.now()+120000){
   const clientId=Deno.env.get('ZOHO_CLIENT_ID'),clientSecret=Deno.env.get('ZOHO_CLIENT_SECRET');
   if(!clientId||!clientSecret)throw new Error('Zoho credentials unavailable');
   const response=await fetch((Deno.env.get('ZOHO_ACCOUNTS_URL')||'https://accounts.zoho.com')+'/oauth/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:token.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
   const text=await response.text();if(!response.ok)throw new Error(`Zoho authorization [${response.status}]: ${text}`);
   const result=JSON.parse(text);if(!result.access_token)throw new Error('Zoho authorization failed');access=result.access_token;
   await checked(db.from('zoho_tokens').update({access_token:access,expires_at:new Date(Date.now()+Number(result.expires_in||3600)*1000).toISOString()}).eq('id',token.id));
  }
  if(state.source==='inventory'){
   const endpoint=new URL((Deno.env.get('ZOHO_API_URL')||'https://www.zohoapis.com')+'/books/v3/items');
   endpoint.search=new URLSearchParams({organization_id:token.organization_id,page:String(state.next_page),per_page:'200'}).toString();
   const response=await fetch(endpoint,{headers:{Authorization:'Zoho-oauthtoken '+access},signal:AbortSignal.timeout(15000)});
   const text=await response.text();if(!response.ok)throw new Error(`Zoho stock [${response.status}]: ${text}`);
   const data=JSON.parse(text);if(data.code!==0||!Array.isArray(data.items))throw new Error(`Zoho stock: ${text}`);
   const inventory={...(state.inventory_data||{})};
   for(const item of data.items){const sku=String(item.sku||'').trim().toUpperCase();if(!sku||/^M-MISC|^MISC/.test(sku))continue;inventory[sku]=inventory[sku]?{...inventory[sku],stockOnHand:null}:{stockOnHand:readStock(item),itemName:item.description||item.name||sku};}
   const next=nextRefreshPage('inventory',state.next_page,Boolean(data.page_context?.has_more_page));
   if(!next.running){
    if(!Object.keys(inventory).length)throw new Error('Zoho returned no identifiable stock; previous figures retained');
    const lock=await checked(db.rpc('try_acquire_zoho_sync_lock',{requested_key:'zoho-event-cache-mutation',lease_seconds:30}));
    if(lock!==true)throw new Error('Stock is being updated by Zoho; retry pending');
    try{const cache=await checked(db.from('buying_sheet_cache').select('payload').eq('id','buying-sheet').maybeSingle());
     await checked(db.from('buying_sheet_cache').upsert({id:'buying-sheet',payload:mergeInventory(cache?.payload||{},inventory,state.cycle_started_at||new Date().toISOString()),fetched_at:new Date().toISOString()}));}
    finally{await db.rpc('release_zoho_sync_lock',{requested_key:'zoho-event-cache-mutation'});}
   }
   await checked(db.from('buying_sync_state').update({...next,inventory_data:next.running?inventory:{},error:null,...(!next.running?{last_success_at:new Date().toISOString()}:{})}).eq('id',true));
   continueScan=next.running;return json({complete:!next.running,source:'inventory',page:state.next_page});
  }
  const module=state.source==='purchase_order'?'purchaseorders':'invoices';
  const idField=state.source==='purchase_order'?'purchaseorder_id':'invoice_id';
  const detailField=state.source==='purchase_order'?'purchaseorder':'invoice';
  const zoho=async(path:string,params:Record<string,string>={})=>{
   const endpoint=new URL((Deno.env.get('ZOHO_API_URL')||'https://www.zohoapis.com')+'/books/v3/'+path);
   endpoint.search=new URLSearchParams({organization_id:token.organization_id,...params}).toString();
   const response=await fetch(endpoint,{headers:{Authorization:'Zoho-oauthtoken '+access},signal:AbortSignal.timeout(12000)});
   const text=await response.text();if(!response.ok)throw new Error(`Zoho ${module} [${response.status}]: ${text}`);
   const data=JSON.parse(text);if(data.code!==0)throw new Error(`Zoho ${module}: ${text}`);return data;
  };
  const list=await zoho(module,{per_page:'20',page:String(state.next_page),sort_column:'created_time',sort_order:'D'});
  if(!Array.isArray(list[module]))throw new Error('Zoho document list unavailable');
  const summaries=list[module];const ids=summaries.map((row:any)=>String(row[idField]));
  const cached=ids.length?await checked(db.from('zoho_document_cache').select('document_id,payload').eq('organization_id',token.organization_id).eq('document_type',state.source).in('document_id',ids)):[];
  const byId=new Map(cached.map((row:any)=>[row.document_id,row.payload]));
  for(let offset=0;offset<summaries.length;offset+=4){
   await Promise.all(summaries.slice(offset,offset+4).map(async(summary:any)=>{
    const id=String(summary[idField]||'');if(!id)throw new Error('Zoho document ID missing');
    const previous:any=byId.get(id);
    const document=previous&&summary.last_modified_time&&previous.last_modified_time===summary.last_modified_time?previous:(await zoho(module+'/'+encodeURIComponent(id)))[detailField];
    if(!document||!Array.isArray(document.line_items))throw new Error('Zoho document lines unavailable');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(document))))].map(v=>v.toString(16).padStart(2,'0')).join('');
    await checked(db.from('zoho_document_cache').upsert({organization_id:token.organization_id,document_type:state.source,document_id:id,payload:document,payload_hash:hash,source_modified_at:document.last_modified_time||document.created_time,synced_at:new Date().toISOString()}));
   }));
  }
  // Invoices only deduct units for active orders; older history is not rescanned three times daily.
  const reachedOldInvoices=state.source==='invoice'&&summaries.some((row:any)=>Date.parse(row.created_time||row.date||'')<Date.now()-180*86400000);
  const next=nextRefreshPage(state.source,state.next_page,!reachedOldInvoices&&(list.page_context?.has_more_page??summaries.length===20));
  await checked(db.from('buying_sync_state').update({...next,error:null,...(!next.running?{last_success_at:new Date().toISOString()}:{})}).eq('id',true));
  continueScan=next.running;
  return json({complete:!next.running,source:state.source,page:state.next_page});
 }catch(error){
  const message=error instanceof Error?error.message:'Zoho refresh failed';
  if(acquired)await db.from('buying_sync_state').update({error:message}).eq('id',true);
  return json({error:message},502);
 }finally{
  if(acquired)await db.rpc('release_zoho_sync_lock',{requested_key:'buying-scheduled-refresh'});
  // Continuation is armed only while this scan has more pages; no permanent polling.
  if(continueScan)EdgeRuntime.waitUntil((async()=>{
   for(let attempt=0;attempt<4;attempt++){
    await new Promise(resolve=>setTimeout(resolve,attempt?25000:1500));
    try{await call('buying-sheet-refresh');return;}
    catch(error){if(attempt===3||!/429|rate limit/i.test(String(error))){await db.from('buying_sync_state').update({error:String(error)}).eq('id',true);return;}}
   }
  })());
 }
});