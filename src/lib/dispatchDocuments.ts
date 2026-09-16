export type DispatchLine={id:string;sku:string;name:string;quantity:number;source_completed:number};
export type DispatchDocument={
 id:string;kind:"collection"|"delivery";source_id:string;reference:string;contact_name:string;address:string|null;
 source_created_at:string;document_date:string|null;source_status:string;source_closed:boolean;lines:DispatchLine[];
 completed_quantities:Record<string,number>;status:string;assigned_to:string|null;scheduled_for:string|null;
 urgent:boolean;method:string;notes:string;revision:number;review_required:boolean;updated_at:string;
};
export const DISPATCH_FIELDS="id,kind,source_id,reference,contact_name,address,source_created_at,document_date,source_status,source_closed,lines,completed_quantities,status,assigned_to,scheduled_for,urgent,method,notes,revision,review_required,updated_at";
export const DISPATCH_START="2026-09-14T00:00:00+02:00";
export function lineRemaining(doc:DispatchDocument,line:DispatchLine){
 return Math.max(0,Number(line.quantity)-Math.max(Number(line.source_completed||0),Number(doc.completed_quantities[line.id]||0)));
}
export const remainingUnits=(doc:DispatchDocument)=>doc.lines.reduce((sum,line)=>sum+lineRemaining(doc,line),0);
export const isActiveDispatch=(doc:DispatchDocument)=>Date.parse(doc.source_created_at)>=Date.parse(DISPATCH_START)&&!doc.source_closed&&!["completed","dismissed"].includes(doc.status)&&remainingUnits(doc)>0;
