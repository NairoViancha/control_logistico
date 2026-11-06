-- ============================================================================
-- MODUGAL · v9 · Estado de tareas y muebles + borrado limpio de personal
-- ----------------------------------------------------------------------------
-- 1. Tareas: el estado solo puede ser En proceso, Detenido o Completado.
-- 2. Muebles asignados: nueva columna estado_trabajo con los mismos 3 estados.
-- 3. Personal: al eliminar a una persona se borran sus tareas (antes la base
--    no dejaba eliminarla si tenía tareas). Sus muebles quedan sin responsable.
-- Es compatible con la app anterior: se puede ejecutar antes o después del push.
-- ============================================================================

begin;

-- 1. TAREAS -------------------------------------------------------------------
update public.tareas_carpintero
   set estado_tarea = case
         when lower(coalesce(estado_tarea, '')) similar to '%(complet|termin|finaliz|hech)%' then 'Completado'
         when lower(coalesce(estado_tarea, '')) similar to '%(deten|paus|bloque)%' then 'Detenido'
         else 'En proceso'
       end
 where estado_tarea is null or estado_tarea not in ('En proceso', 'Detenido', 'Completado');

alter table public.tareas_carpintero alter column estado_tarea set default 'En proceso';
alter table public.tareas_carpintero alter column estado_tarea set not null;
alter table public.tareas_carpintero drop constraint if exists tareas_estado_check;
alter table public.tareas_carpintero add constraint tareas_estado_check
  check (estado_tarea in ('En proceso', 'Detenido', 'Completado'));

-- 2. MUEBLES ------------------------------------------------------------------
alter table public.proyecto_muebles
  add column if not exists estado_trabajo text not null default 'En proceso';
alter table public.proyecto_muebles drop constraint if exists muebles_estado_trabajo_check;
alter table public.proyecto_muebles add constraint muebles_estado_trabajo_check
  check (estado_trabajo in ('En proceso', 'Detenido', 'Completado'));

-- 3. PERSONAL: tareas en cascada al eliminar a la persona ---------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.conrelid = 'public.tareas_carpintero'::regclass
       and c.confrelid = 'public.carpinteros'::regclass
       and c.confdeltype <> 'c'
  loop
    execute format('alter table public.tareas_carpintero drop constraint %I', r.conname);
    execute format('alter table public.tareas_carpintero add constraint %I foreign key (%I) references public.carpinteros (id) on delete cascade',
                   r.conname, r.columna);
  end loop;
end $$;

commit;

-- RESUMEN ---------------------------------------------------------------------
select 'tareas por estado' as chequeo,
       coalesce((select string_agg(estado_tarea || ': ' || n, ', ' order by estado_tarea)
                   from (select estado_tarea, count(*) n from public.tareas_carpintero group by 1) x), 'sin tareas') as resultado
union all
select 'muebles con estado_trabajo', count(*)::text from public.proyecto_muebles
union all
select 'tareas se borran con la persona',
       case when exists (select 1 from pg_constraint
                          where conrelid = 'public.tareas_carpintero'::regclass
                            and confrelid = 'public.carpinteros'::regclass and confdeltype = 'c')
            then 'sí' else 'no' end;
