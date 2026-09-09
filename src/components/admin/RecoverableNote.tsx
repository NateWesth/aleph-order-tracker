import {useState} from "react";
import {useDraftRecovery} from "@/hooks/useDraftRecovery";
import {Textarea} from "@/components/ui/textarea";
import {Button} from "@/components/ui/button";
export default function RecoverableNote({recordKey,value,version,onSave}:{recordKey:string;value:string|null;version:string|null;onSave:(body:string,base:string|null)=>Promise<boolean>}){
 const [draft,setDraft]=useState({body:value||"",base:version});const [dirty,setDirty]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
 const recovery=useDraftRecovery("note:"+recordKey,draft,dirty,saved=>{setDraft(saved);setDirty(true);});
 const save=async()=>{if(!dirty||saving)return;setSaving(true);try{if(await onSave(draft.body,draft.base)){recovery.clear();setDirty(false);setError("");}}catch(error){setError(error instanceof Error?error.message:"Not saved");}finally{setSaving(false)}};
 return <div className="space-y-2">{recovery.banner}<Textarea aria-label="Movement notes" value={dirty?draft.body:value||""} disabled={saving} onChange={e=>{if(!dirty)setDraft({body:e.target.value,base:version});else setDraft(current=>({...current,body:e.target.value}));setDirty(true);}} placeholder="Add instructions…"/>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}<Button size="sm" variant="outline" disabled={!dirty||saving} onClick={save}>{saving?"Saving…":dirty?"Save notes":"Saved"}</Button></div>;
}
