-- ============================================================================
-- MODUGAL · v7 · Fase 2 (parte 3): INCIDENTES (antes "bloqueos")
-- ----------------------------------------------------------------------------
-- 1. public.incidentes: tipo, gravedad, responsable, plan de acción, fechas
--    de apertura/compromiso/cierre, solución, días de impacto en la entrega
--    y si detiene la producción. Puede ligarse a una compra.
-- 2. Regla de compras: una compra recibida "Con novedad" deja su pendiente
--    ABIERTO hasta que la novedad se resuelva. Resolver el incidente ligado
--    aprueba la calidad de la compra y cierra el pendiente.
-- 3. Migra los bloqueos del JSON (una sola vez, con respaldo y verificación).
-- Requiere v6. Publicar PRIMERO la app compatible y luego ejecutar esto.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. RESPALDO
-- ----------------------------------------------------------------------------
insert into public.respaldo_descripcion_venta (proyecto_id, codigo_prj, descripcion_venta, motivo)
select id, codigo_prj, descripcion_venta, 'v7 · antes de migrar incidentes'
  from public.proyectos
 where not exists (select 1 from public.respaldo_descripcion_venta r
                    where r.motivo = 'v7 · antes de migrar incidentes');


-- ----------------------------------------------------------------------------
-- 2. TABLA incidentes
-- ----------------------------------------------------------------------------
create table if not exists public.incidentes (
  id                 uuid primary key default gen_random_uuid(),
  proyecto_id        uuid not null references public.proyectos (id) on delete cascade,
  tipo               text not null default 'Otro'
                     check (tipo in ('Material faltante', 'Material defectuoso', 'Diseño / planos', 'Cliente',
                                     'Personal', 'Maquinaria', 'Transporte / despacho', 'Otro')),
  gravedad           text not null default 'Media' check (gravedad in ('Baja', 'Media', 'Alta', 'Crítica')),
  descripcion        text not null check (length(trim(descripcion)) > 0),
  accion             text,          -- plan de acción
  responsable        text,          -- quién debe resolverlo (persona, proveedor, área)
  detiene_produccion boolean not null default false,
  estado             text not null default 'Abierto' check (estado in ('Abierto', 'En gestión', 'Resuelto')),
  fecha_apertura     timestamptz not null default now(),
  fecha_compromiso   date,
  fecha_cierre       timestamptz,
  solucion           text,
  dias_impacto       integer not null default 0 check (dias_impacto >= 0),
  compra_id          uuid references public.compras (id) on delete set null,
  legacy_id          text,
  version            integer not null default 1,
  creado_por         uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (proyecto_id, legacy_id),
  check (estado <> 'Resuelto' or (solucion is not null and length(trim(solucion)) > 0))
);

create index if not exists incidentes_proyecto_idx on public.incidentes (proyecto_id);
create index if not exists incidentes_abiertos_idx on public.incidentes (estado, gravedad) where estado <> 'Resuelto';
create index if not exists incidentes_compra_idx   on public.incidentes (compra_id);

-- Fecha de cierre automática
create or replace function public.fechar_incidente()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'Resuelto' and (tg_op = 'INSERT' or old.estado <> 'Resuelto') then
    new.fecha_cierre := coalesce(new.fecha_cierre, now());
  elsif new.estado <> 'Resuelto' then
    new.fecha_cierre := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_fechar_incidente on public.incidentes;
create trigger trg_fechar_incidente
  before insert or update on public.incidentes
  for each row execute function public.fechar_incidente();

drop trigger if exists trg_versionar_incidente on public.incidentes;
create trigger trg_versionar_incidente
  before update on public.incidentes
  for each row execute function public.versionar_fila();

drop trigger if exists trg_historial on public.incidentes;
create trigger trg_historial
  after insert or update or delete on public.incidentes
  for each row execute function public.registrar_evento();


-- ----------------------------------------------------------------------------
-- 3. PERMISOS: todos ven; Gerencia, Logística y Secretaría reportan y
--    gestionan; solo Gerencia borra (lo normal es resolver, no borrar).
-- ----------------------------------------------------------------------------
alter table public.incidentes enable row level security;

drop policy if exists incidentes_select on public.incidentes;
drop policy if exists incidentes_insert on public.incidentes;
drop policy if exists incidentes_update on public.incidentes;
drop policy if exists incidentes_delete on public.incidentes;
create policy incidentes_select on public.incidentes
  for select to authenticated using (public.mi_rol() is not null);
create policy incidentes_insert on public.incidentes
  for insert to authenticated
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));
create policy incidentes_update on public.incidentes
  for update to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']))
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));
create policy incidentes_delete on public.incidentes
  for delete to authenticated using (public.tiene_rol(array['administrativo']));

drop policy if exists historial_select on public.historial_eventos;
create policy historial_select on public.historial_eventos
  for select to authenticated
  using (
    public.tiene_rol(array['administrativo'])
    or (public.tiene_rol(array['operativo', 'secretaria'])
        and tabla in ('proyectos', 'pendientes', 'tareas_carpintero', 'carpinteros',
                      'proyecto_muebles', 'compras', 'incidentes'))
  );

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incidentes') then
    alter publication supabase_realtime add table public.incidentes;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 4. COMPRAS: el pendiente se cierra solo si la compra quedó Cancelada, o
--    Recibida SIN novedad de calidad. Con novedad sigue abierto.
-- ----------------------------------------------------------------------------
create or replace function public.compra_cerrada(estado text, calidad text)
returns boolean
language sql immutable
as $$
  select estado = 'Cancelado' or (estado = 'Recibido' and calidad is distinct from 'Con novedad');
$$;

create or replace function public.sincronizar_pendiente_compra()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  antes   boolean := public.compra_cerrada(old.estado, old.control_calidad);
  despues boolean := public.compra_cerrada(new.estado, new.control_calidad);
begin
  if new.pendiente_id is null or antes = despues then
    return null;
  end if;
  update public.pendientes
     set estado = case when despues then 'Resuelto' else 'Pendiente' end
   where id = new.pendiente_id
     and estado = case when despues then 'Pendiente' else 'Resuelto' end;
  return null;
end $$;

drop trigger if exists trg_pendiente_compra on public.compras;
create trigger trg_pendiente_compra
  after update of estado, control_calidad on public.compras
  for each row execute function public.sincronizar_pendiente_compra();

-- Resolver un incidente ligado a una compra = novedad resuelta (calidad
-- aprobada). Si el incidente se reabre, la compra vuelve a "Con novedad".
create or replace function public.novedad_compra_desde_incidente()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.compra_id is null or old.estado is not distinct from new.estado then
    return null;
  end if;
  if new.estado = 'Resuelto' then
    update public.compras set control_calidad = 'Aprobado'
     where id = new.compra_id and control_calidad = 'Con novedad';
  elsif old.estado = 'Resuelto' then
    update public.compras set control_calidad = 'Con novedad'
     where id = new.compra_id and control_calidad <> 'Con novedad';
  end if;
  return null;
end $$;

drop trigger if exists trg_novedad_compra on public.incidentes;
create trigger trg_novedad_compra
  after update of estado on public.incidentes
  for each row execute function public.novedad_compra_desde_incidente();


-- ----------------------------------------------------------------------------
-- 5. VISTA DE SEGUIMIENTO (respeta la RLS de quien consulta)
-- ----------------------------------------------------------------------------
create or replace view public.incidentes_seguimiento
with (security_invoker = true) as
select i.*,
       p.codigo_prj,
       p.cliente,
       (i.estado <> 'Resuelto') as abierto,
       (coalesce(i.fecha_cierre, now())::date - i.fecha_apertura::date) as dias_abierto,
       (i.estado <> 'Resuelto' and i.fecha_compromiso is not null and i.fecha_compromiso < current_date) as vencido
  from public.incidentes i
  join public.proyectos p on p.id = i.proyecto_id;

grant select on public.incidentes_seguimiento to authenticated;


-- ----------------------------------------------------------------------------
-- 6. MIGRACIÓN (una sola vez): bloqueos e incidentes guardados en el JSON
-- ----------------------------------------------------------------------------
do $$
declare
  insertados integer;
  reabiertos integer;
  faltantes  integer;
  detalle    text;
begin
  if exists (select 1 from public.migraciones_aplicadas where nombre = 'v7_incidentes') then
    raise notice 'La migración de incidentes ya se había aplicado: no se repite.';
    return;
  end if;

  with origen as (
    -- Bloqueos antiguos: { id, reason, action, solved }
    select p.id as proyecto_id, p.created_at, p.descripcion_venta, b.valor,
           'b:' || coalesce(b.valor ->> 'id', '') || '#' || b.ord as legacy_id, 'bloqueo' as origen
      from public.proyectos p
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'bloqueos') = 'array'
                  then public.mg_json(p.descripcion_venta) -> 'bloqueos' else '[]'::jsonb end
           ) with ordinality as b(valor, ord)
    union all
    -- Incidentes creados por la app antes de existir la tabla
    select p.id, p.created_at, p.descripcion_venta, i.valor,
           'i:' || coalesce(i.valor ->> 'id', '') || '#' || i.ord, 'incidente'
      from public.proyectos p
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'incidentes') = 'array'
                  then public.mg_json(p.descripcion_venta) -> 'incidentes' else '[]'::jsonb end
           ) with ordinality as i(valor, ord)
  )
  insert into public.incidentes
    (proyecto_id, tipo, gravedad, descripcion, accion, responsable, detiene_produccion, estado,
     fecha_apertura, fecha_compromiso, solucion, dias_impacto, legacy_id)
  select o.proyecto_id,
         case when o.valor ->> 'tipo' in ('Material faltante', 'Material defectuoso', 'Diseño / planos', 'Cliente',
                                           'Personal', 'Maquinaria', 'Transporte / despacho', 'Otro')
              then o.valor ->> 'tipo' else 'Otro' end,
         case when o.valor ->> 'gravedad' in ('Baja', 'Media', 'Alta', 'Crítica') then o.valor ->> 'gravedad' else 'Alta' end,
         coalesce(nullif(trim(coalesce(o.valor ->> 'descripcion', o.valor ->> 'reason')), ''), 'Bloqueo sin descripción'),
         nullif(trim(coalesce(o.valor ->> 'accion', o.valor ->> 'action')), ''),
         nullif(trim(o.valor ->> 'responsable'), ''),
         case when o.origen = 'incidente' then coalesce(o.valor ->> 'detiene' = 'true', false)
              else (public.mg_json(o.descripcion_venta) ->> 'status') = 'Detenido'
                   and coalesce(o.valor ->> 'solved', 'false') <> 'true' end,
         est.estado,
         coalesce(public.fecha_desde_texto(o.valor ->> 'fechaApertura')::timestamptz, o.created_at, now()),
         public.fecha_desde_texto(o.valor ->> 'fechaCompromiso'),
         case when est.estado = 'Resuelto'
              then coalesce(nullif(trim(o.valor ->> 'solucion'), ''), 'Resuelto antes de la migración') end,
         case when o.valor ->> 'diasImpacto' ~ '^\d{1,4}$' then (o.valor ->> 'diasImpacto')::integer else 0 end,
         o.legacy_id
    from origen o
    cross join lateral (
      select case
               when o.origen = 'incidente' and o.valor ->> 'estado' in ('Abierto', 'En gestión', 'Resuelto') then o.valor ->> 'estado'
               when o.valor ->> 'solved' = 'true' then 'Resuelto'
               else 'Abierto'
             end as estado
    ) est
  on conflict (proyecto_id, legacy_id) do nothing;
  get diagnostics insertados = row_count;

  -- Verificación: todo lo que había en el JSON está en la tabla
  select count(*), string_agg(codigo_prj || ' (' || en_json || ' en JSON / ' || en_tabla || ' en tabla)', ', ')
    into faltantes, detalle
    from (
      select p.codigo_prj,
             coalesce(case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'bloqueos') = 'array'
                           then jsonb_array_length(public.mg_json(p.descripcion_venta) -> 'bloqueos') end, 0)
           + coalesce(case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'incidentes') = 'array'
                           then jsonb_array_length(public.mg_json(p.descripcion_venta) -> 'incidentes') end, 0) as en_json,
             (select count(*) from public.incidentes i
               where i.proyecto_id = p.id and i.legacy_id is not null) as en_tabla
        from public.proyectos p
    ) x
   where en_tabla < en_json;
  if faltantes > 0 then
    raise exception 'Migración incompleta, no se aplicó ningún cambio: %', detalle;
  end if;

  -- Regla nueva: compras recibidas con novedad vuelven a tener su pendiente abierto
  update public.pendientes pe
     set estado = 'Pendiente'
    from public.compras c
   where c.pendiente_id = pe.id
     and c.estado = 'Recibido' and c.control_calidad = 'Con novedad'
     and pe.estado = 'Resuelto';
  get diagnostics reabiertos = row_count;

  insert into public.migraciones_aplicadas (nombre, detalle)
  values ('v7_incidentes', insertados || ' incidentes migrados; ' || reabiertos || ' pendientes de compras con novedad reabiertos');
end $$;

commit;


-- ----------------------------------------------------------------------------
-- 7. RESUMEN
-- ----------------------------------------------------------------------------
select 'incidentes en tabla' as chequeo, count(*)::text as resultado from public.incidentes
union all
select 'incidentes abiertos', count(*)::text from public.incidentes where estado <> 'Resuelto'
union all
select 'abiertos que detienen producción', count(*)::text from public.incidentes
 where estado <> 'Resuelto' and detiene_produccion
union all
select 'migración', coalesce((select detalle from public.migraciones_aplicadas where nombre = 'v7_incidentes'), 'NO APLICADA');
