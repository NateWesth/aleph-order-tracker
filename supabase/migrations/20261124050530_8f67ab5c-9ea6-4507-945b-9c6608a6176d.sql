REVOKE ALL ON public.stock_alert_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stock_alert_state TO authenticated;
GRANT ALL ON public.stock_alert_state TO service_role;