-- A fingerprint of everything this app puts in a database, one line per kind.
--
-- RUN IT ON TWO DATABASES AND COMPARE THE LINES. Every line equal means the two
-- are the same app: the same tables, columns, constraints, indexes, functions,
-- row rules, triggers, grants, storage bucket and realtime publication. This is
-- how "a fresh install from this repository is the live database" was proven on
-- 23 September 2026, and how anybody can prove it again:
--
--   psql "$LIVE_DATABASE_URL"  -tA -F ' ' -f supabase/tests/fingerprint.sql
--   psql "$FRESH_DATABASE_URL" -tA -F ' ' -f supabase/tests/fingerprint.sql
--
-- WHAT IT SETS ASIDE, and why each is not this app's to fingerprint:
--   * comments and line breaks inside function bodies. The Supabase tool that
--     applies migrations strips comments from function bodies; a comment
--     changes nothing a function does.
--   * the storage service's own triggers, the pg_net version, and
--     rls_auto_enable() (made by the Supabase dashboard on some projects).
--   * the authenticator role's platform settings. The one setting this app owns
--     there -- the check PostgREST runs before every request -- is its own line.
--
-- Read-only: it only looks at the catalogue, never at anybody's rows.
with cat(kind, key, detail) as (
  select 'table', n.nspname||'.'||c.relname,
         'kind='||c.relkind::text||' rls='||c.relrowsecurity||' force='||c.relforcerowsecurity||' replident='||c.relreplident::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private') and c.relkind in ('r','v','m','p')
  union all
  select 'column', n.nspname||'.'||c.relname||'.'||a.attname,
         format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||' gen='||a.attgenerated::text||' ident='||a.attidentity::text
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where n.nspname in ('public','private') and c.relkind in ('r','v','m','p') and a.attnum>0 and not a.attisdropped
  union all
  select 'constraint', n.nspname||'.'||c.relname||'.'||co.conname, pg_get_constraintdef(co.oid)
    from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private')
  union all
  select 'index', schemaname||'.'||indexname, indexdef from pg_indexes where schemaname in ('public','private')
  union all
  select 'function', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prokind in ('f','p')
  union all
  select 'function_acl', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', coalesce(p.proacl::text,'default')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prokind in ('f','p')
  union all
  select 'policy', schemaname||'.'||tablename||'.'||policyname,
         permissive||' '||cmd||' '||roles::text||' using='||coalesce(qual,'')||' check='||coalesce(with_check,'')
    from pg_policies where schemaname in ('public','private','storage')
  union all
  select 'trigger', n.nspname||'.'||c.relname||'.'||t.tgname, pg_get_triggerdef(t.oid)||' enabled='||t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where not t.tgisinternal and n.nspname in ('public','private','auth','storage')
  union all
  select 'table_acl', n.nspname||'.'||c.relname, coalesce(c.relacl::text,'default')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private') and c.relkind in ('r','v','m','p','S')
  union all
  select 'enum', n.nspname||'.'||t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
    from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
   where n.nspname in ('public','private') group by 1,2
  union all
  select 'view', schemaname||'.'||viewname, definition from pg_views where schemaname in ('public','private')
  union all
  select 'publication', schemaname||'.'||tablename, pubname from pg_publication_tables where pubname='supabase_realtime'
  union all
  select 'event_trigger', evtname, evtevent||' '||evtenabled::text||' '||evtfoid::regproc::text||' '||coalesce(array_to_string(evttags,','),'')
    from pg_event_trigger where evtname not like 'pgrst%' and evtname not like 'issue_%' and evtname not like 'graphql%' and evtname not like 'pg_%' and evtname not like 'ensure_rls'
  union all
  select 'bucket', id, 'public='||public||' limit='||coalesce(file_size_limit::text,'')||' mime='||coalesce(allowed_mime_types::text,'')
    from storage.buckets
  union all
  select 'extension', extname, extversion from pg_extension where extname not in ('pg_graphql','supabase_vault')
  union all
  select 'role_config', rolname, coalesce(array_to_string(rolconfig,' | '),'')
    from pg_roles where rolname in ('authenticator','anon','authenticated','service_role')
  union all
  select 'schema_acl', nspname, coalesce(nspacl::text,'default') from pg_namespace where nspname in ('public','private')
  union all
  select 'sequence', schemaname||'.'||sequencename, data_type::text||' start='||start_value from pg_sequences where schemaname in ('public','private')
)
, norm as (
  select kind, key, btrim(regexp_replace(regexp_replace(detail, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')) as d from cat
   where not (kind = 'trigger' and key like 'storage.%')
     and not (kind in ('function','function_acl') and key = 'public.rls_auto_enable()')
     and not (kind = 'extension' and key = 'pg_net')
     and not (kind = 'role_config' and key = 'authenticator'))
select kind, count(*), left(md5(string_agg(key||'|'||md5(d), E'\n' order by key)),10) from norm group by kind
union all
select 'authenticator app setting', 1, left(md5(coalesce((select c from pg_roles r, unnest(r.rolconfig) c where r.rolname='authenticator' and c like 'pgrst.%'),'')),10)
order by 1;
