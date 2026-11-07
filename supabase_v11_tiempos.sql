-- ============================================================================
-- MODUGAL · v11 · Medición de tiempos de trabajo
-- ----------------------------------------------------------------------------
-- Cada tarea y cada mueble asignado registra:
--   asignada_en / asignado_en     → cuándo se le asignó a la persona
--   completada_en / completado_en → cuándo se marcó "Completado"
-- Las horas las pone la base (no el celular de nadie), así son confiables.
-- Si se cambia la persona, el reloj vuelve a empezar. Si una tarea completada
-- se reabre, se borra la hora de fin.
-- Tareas viejas: se toma como inicio la fecha en que se crearon. Las que ya
-- estaban completadas no tienen hora real de fin y no entran en promedios.
-- Se puede ejecutar antes o después del push (la app funciona con o sin esto).
-- ============================================================================

begin;

-- 1. TAREAS -------------------------------------------------------------------
alter table public.tareas_carpintero
  add column if not exists asignada_en   timestamptz,
  add column if not exists completada_en timestamptz;

update public.tareas_carpintero
   set asignada_en = coalesce(created_at, now())
 where asignada_en is null;

alter table public.tareas_carpintero alter column asignada_en set default now();
alter table public.tareas_carpintero alter column asignada_en set not null;

create or replace function public.tiempos_tarea()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.asignada_en := now();
    new.completada_en := case when new.estado_tarea = 'Completado' then now() end;
    return new;
  end if;
  -- Nadie puede reescribir las horas desde la app
  new.asignada_en := old.asignada_en;
  new.completada_en := old.completada_en;
  if new.carpintero_id is distinct from old.carpintero_id then
    new.asignada_en := now();
    new.completada_en := null;
  end if;
  if new.estado_tarea = 'Completado' then
    if old.estado_tarea is distinct from 'Completado' or new.completada_en is null then
      new.completada_en := now();
    end if;
  else
    new.completada_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_tiempos_trabajo on public.tareas_carpintero;
create trigger trg_tiempos_trabajo
  before insert or update on public.tareas_carpintero
  for each row execute function public.tiempos_tarea();

create index if not exists tareas_tiempos_idx on public.tareas_carpintero (carpintero_id, completada_en);

-- 2. MUEBLES ------------------------------------------------------------------
alter table public.proyecto_muebles
  add column if not exists asignado_en   timestamptz,
  add column if not exists completado_en timestamptz;

update public.proyecto_muebles
   set asignado_en = coalesce(created_at, now())
 where asignado_en is null
   and (responsable_id is not null or nullif(trim(coalesce(responsable_nombre, '')), '') is not null);

create or replace function public.tiempos_mueble()
returns trigger
language plpgsql
as $$
declare
  tiene_resp boolean := new.responsable_id is not null
                        or nullif(trim(coalesce(new.responsable_nombre, '')), '') is not null;
begin
  if tg_op = 'INSERT' then
    new.asignado_en := case when tiene_resp then now() end;
    new.completado_en := case when tiene_resp and new.estado_trabajo = 'Completado' then now() end;
    return new;
  end if;
  new.asignado_en := old.asignado_en;
  new.completado_en := old.completado_en;
  if new.responsable_id is distinct from old.responsable_id
     or coalesce(new.responsable_nombre, '') is distinct from coalesce(old.responsable_nombre, '') then
    new.asignado_en := case when tiene_resp then now() end;
    new.completado_en := null;
  elsif tiene_resp and new.asignado_en is null then
    new.asignado_en := now();
  end if;
  if new.estado_trabajo = 'Completado' and tiene_resp then
    if old.estado_trabajo is distinct from 'Completado' or new.completado_en is null then
      new.completado_en := now();
    end if;
  else
    new.completado_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_tiempos_trabajo on public.proyecto_muebles;
create trigger trg_tiempos_trabajo
  before insert or update on public.proyecto_muebles
  for each row execute function public.tiempos_mueble();

-- 3. VISTA PARA REPORTES (respeta los permisos de quien consulta) --------------
create or replace view public.tiempos_trabajo
with (security_invoker = true) as
select 'tarea'::text as tipo, t.id, p.codigo_prj, p.cliente, c.nombre as persona,
       t.actividad, t.estado_tarea as estado, t.asignada_en as inicio, t.completada_en as fin,
       coalesce(t.completada_en, now()) - t.asignada_en as duracion
  from public.tareas_carpintero t
  left join public.proyectos p on p.id = t.proyecto_id
  left join public.carpinteros c on c.id = t.carpintero_id
union all
select 'mueble', m.id, p.codigo_prj, p.cliente, coalesce(c.nombre, m.responsable_nombre),
       m.actividad, m.estado_trabajo, m.asignado_en, m.completado_en,
       coalesce(m.completado_en, now()) - m.asignado_en
  from public.proyecto_muebles m
  join public.proyectos p on p.id = m.proyecto_id
  left join public.carpinteros c on c.id = m.responsable_id
 where m.asignado_en is not null;

grant select on public.tiempos_trabajo to authenticated;

commit;

-- RESUMEN ---------------------------------------------------------------------
select 'tareas con hora de asignación' as chequeo, count(*)::text as resultado
  from public.tareas_carpintero where asignada_en is not null
union all
select 'muebles asignados con hora', count(*)::text from public.proyecto_muebles where asignado_en is not null
union all
select 'trabajos completados con hora de fin', count(*)::text from public.tiempos_trabajo where fin is not null;
