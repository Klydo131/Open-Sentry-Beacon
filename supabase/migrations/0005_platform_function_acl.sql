-- Supabase creates this event-trigger helper in public on some projects. It is
-- internal infrastructure, not an application RPC. Revoking invocation does
-- not stop the event trigger itself from running.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
