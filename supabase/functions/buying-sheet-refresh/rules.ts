export const BUYING_REFRESH_HOURS_SAST = [7, 12, 17];
export const BUYING_REFRESH_CRON = '0 5,10,15 * * *';
export function canStartRefresh(lastAttempt: string | null, now: number) {
  return !lastAttempt || now-Date.parse(lastAttempt)>=4*60*60*1000;
}
export function nextRefreshPage(source: string, page: number, hasMore: boolean) {
  if(hasMore)return {source,next_page:page+1,running:true};
  if(source==='purchase_order')return {source:'invoice',next_page:1,running:true};
  return {source:'purchase_order',next_page:1,running:false};
}