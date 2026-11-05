-- ============================================================================
-- MODUGAL · v6 · Fase 2 (parte 2): COMPRAS DE MATERIAL EN TABLA PROPIA
-- ----------------------------------------------------------------------------
-- Saca los pedidos del JSON de descripcion_venta a public.compras, con
-- cantidades, fechas reales, estado de entrega y control de calidad.
--
-- Igual que la v5:
--   1. Una sola transacción: si algo falla, no cambia nada.
--   2. Respaldo de descripcion_venta antes de migrar.
--   3. Verificación de conteos proyecto por proyecto (si no cuadran, aborta).
--   4. La migración se marca y no se repite nunca.
-- Requiere v5. Publicar PRIMERO la app compatible y luego ejecutar esto.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. RESPALDO
-- ----------------------------------------------------------------------------
insert into public.respaldo_descripcion_venta (proyecto_id, codigo_prj, descripcion_venta, motivo)
select id, codigo_prj, descripcion_venta, 'v6 · antes de migrar compras'
  from public.proyectos
 where not exists (select 1 from public.respaldo_descripcion_venta r
                    where r.motivo = 'v6 · antes de migrar compras');


-- ----------------------------------------------------------------------------
-- 2. TABLA compras
-- ----------------------------------------------------------------------------
create table if not exists public.compras (
  id                uuid primary key default gen_random_uuid(),
  proyecto_id       uuid not null references public.proyectos (id) on delete cascade,
  categoria         text,
  material          text not null check (length(trim(material)) > 0),
  cantidad          numeric(12, 2) not null default 1 check (cantidad > 0),
  unidad            text not null default 'und',
  cantidad_recibida numeric(12, 2) not null default 0 check (cantidad_recibida >= 0),
  proveedor         text not null check (length(trim(proveedor)) > 0),
  numero_guia       text,
  fecha_solicitud   date not null default current_date,
  fecha_prometida   date,
  fecha_recibida    date,
  estado            text not null default 'Solicitado'
                    check (estado in ('Solicitado', 'Confirmado', 'En tránsito', 'Recibido parcial', 'Recibido', 'Cancelado')),
  control_calidad   text not null default 'Pendiente'
                    check (control_calidad in ('Pendiente', 'Aprobado', 'Con novedad')),
  notas             text,
  pendiente_id      uuid references public.pendientes (id) on delete set null,
  legacy_id         text,
  version           integer not null default 1,
  creado_por        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (proyecto_id, legacy_id)
);

create index if not exists compras_proyecto_idx  on public.compras (proyecto_id);
create index if not exists compras_estado_idx    on public.compras (estado, fecha_prometida);
create index if not exists compras_proveedor_idx on public.compras (lower(proveedor));

drop trigger if exists trg_versionar_compra on public.compras;
create trigger trg_versionar_compra
  before update on public.compras
  for each row execute function public.versionar_fila();

drop trigger if exists trg_historial on public.compras;
create trigger trg_historial
  after insert or update or delete on public.compras
  for each row execute function public.registrar_evento();

-- Al recibir el material completo (o cancelar la compra) se resuelve solo el
-- pendiente que se creó con ella; si vuelve a quedar abierta, se reabre.
create or replace function public.sincronizar_pendiente_compra()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.pendiente_id is null then
    return null;
  end if;
  if new.estado in ('Recibido', 'Cancelado') and old.estado is distinct from new.estado then
    update public.pendientes set estado = 'Resuelto'
     where id = new.pendiente_id and estado <> 'Resuelto';
  elsif old.estado in ('Recibido', 'Cancelado') and new.estado not in ('Recibido', 'Cancelado') then
    update public.pendientes set estado = 'Pendiente'
     where id = new.pendiente_id and estado = 'Resuelto';
  end if;
  return null;
end $$;

drop trigger if exists trg_pendiente_compra on public.compras;
create trigger trg_pendiente_compra
  after update of estado on public.compras
  for each row execute function public.sincronizar_pendiente_compra();


-- ----------------------------------------------------------------------------
-- 3. PERMISOS: todos los aprobados ven; Gerencia y Logística registran,
--    actualizan y cancelan. (Las compras NO llevan precios: eso es finanzas.)
-- ----------------------------------------------------------------------------
alter table public.compras enable row level security;

drop policy if exists compras_select on public.compras;
drop policy if exists compras_write  on public.compras;
create policy compras_select on public.compras
  for select to authenticated using (public.mi_rol() is not null);
create policy compras_write on public.compras
  for all to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo']))
  with check (public.tiene_rol(array['administrativo', 'operativo']));

drop policy if exists historial_select on public.historial_eventos;
create policy historial_select on public.historial_eventos
  for select to authenticated
  using (
    public.tiene_rol(array['administrativo'])
    or (public.tiene_rol(array['operativo', 'secretaria'])
        and tabla in ('proyectos', 'pendientes', 'tareas_carpintero', 'carpinteros', 'proyecto_muebles', 'compras'))
  );

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'compras') then
    alter publication supabase_realtime add table public.compras;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 4. VISTA DE SEGUIMIENTO (respeta la RLS de quien consulta)
--    Base para reportes e IA: atrasos, faltantes por proveedor, etc.
-- ----------------------------------------------------------------------------
create or replace view public.compras_seguimiento
with (security_invoker = true) as
select c.*,
       p.codigo_prj,
       p.cliente,
       (c.estado not in ('Recibido', 'Cancelado')) as abierta,
       greatest(c.cantidad - c.cantidad_recibida, 0) as cantidad_pendiente,
       case when c.estado not in ('Recibido', 'Cancelado')
             and c.fecha_prometida is not null
             and c.fecha_prometida < current_date
            then current_date - c.fecha_prometida else 0 end as dias_atraso
  from public.compras c
  join public.proyectos p on p.id = c.proyecto_id;

grant select on public.compras_seguimiento to authenticated;


-- ----------------------------------------------------------------------------
-- 5. MIGRACIÓN desde el JSON (una sola vez)
-- ----------------------------------------------------------------------------
-- Fechas escritas a mano: "20 Nov 2026", "5 dic 2026", "2026-11-20"
create or replace function public.fecha_desde_texto(txt text)
returns date
language plpgsql immutable
as $$
declare
  m text[];
  mes integer;
begin
  if txt is null then return null; end if;
  if txt ~ '^\d{4}-\d{2}-\d{2}' then
    return left(txt, 10)::date;
  end if;
  m := regexp_match(lower(trim(txt)), '(\d{1,2})\s+([a-záéíóú]+)\.?\s+(\d{4})');
  if m is null then return null; end if;
  mes := case left(m[2], 3)
           when 'ene' then 1 when 'jan' then 1 when 'feb' then 2 when 'mar' then 3
           when 'abr' then 4 when 'apr' then 4 when 'may' then 5 when 'jun' then 6
           when 'jul' then 7 when 'ago' then 8 when 'aug' then 8 when 'sep' then 9
           when 'oct' then 10 when 'nov' then 11 when 'dic' then 12 when 'dec' then 12
         end;
  if mes is null then return null; end if;
  return make_date(m[3]::integer, mes, m[1]::integer);
exception when others then
  return null;
end $$;

do $$
declare
  insertados integer;
  faltantes  integer;
  detalle    text;
begin
  if exists (select 1 from public.migraciones_aplicadas where nombre = 'v6_compras') then
    raise notice 'La migración de compras ya se había aplicado: no se repite.';
    return;
  end if;

  insert into public.compras
    (proyecto_id, categoria, material, proveedor, numero_guia, fecha_solicitud, fecha_prometida,
     estado, control_calidad, cantidad_recibida, fecha_recibida, notas, legacy_id)
  select p.id,
         nullif(trim(x.valor ->> 'category'), ''),
         coalesce(nullif(trim(x.valor ->> 'item'), ''), 'Material sin descripción'),
         coalesce(nullif(trim(x.valor ->> 'supplier'), ''), 'Proveedor por definir'),
         nullif(nullif(trim(x.valor ->> 'guide'), ''), 'Sin Guía'),
         coalesce(p.created_at::date, current_date),
         public.fecha_desde_texto(x.valor ->> 'expected'),
         e.estado,
         case when x.valor ->> 'qc' in ('Aprobado', 'Con novedad') then x.valor ->> 'qc' else 'Pendiente' end,
         case when e.estado = 'Recibido' then 1 else 0 end,
         null,
         case when public.fecha_desde_texto(x.valor ->> 'expected') is null
               and nullif(trim(x.valor ->> 'expected'), '') is not null
               and trim(x.valor ->> 'expected') <> 'Por definir'
              then 'Fecha original: ' || trim(x.valor ->> 'expected') end,
         coalesce(x.valor ->> 'id', '') || '#' || x.ord
    from public.proyectos p
    cross join lateral jsonb_array_elements(
           case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'pedidos') = 'array'
                then public.mg_json(p.descripcion_venta) -> 'pedidos' else '[]'::jsonb end
         ) with ordinality as x(valor, ord)
    cross join lateral (
           select case
                    when x.valor ->> 'status' in ('Bodega', 'Entregado', 'Recibido') then 'Recibido'
                    when x.valor ->> 'status' ilike 'en tr%nsito' then 'En tránsito'
                    when x.valor ->> 'status' = 'Confirmado' then 'Confirmado'
                    when x.valor ->> 'status' = 'Cancelado' then 'Cancelado'
                    else 'Solicitado'
                  end as estado
         ) e
  on conflict (proyecto_id, legacy_id) do nothing;
  get diagnostics insertados = row_count;

  select count(*), string_agg(codigo_prj || ' (' || en_json || ' en JSON / ' || en_tabla || ' en tabla)', ', ')
    into faltantes, detalle
    from (
      select p.codigo_prj,
             jsonb_array_length(public.mg_json(p.descripcion_venta) -> 'pedidos') as en_json,
             (select count(*) from public.compras c
               where c.proyecto_id = p.id and c.legacy_id is not null) as en_tabla
        from public.proyectos p
       where jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'pedidos') = 'array'
    ) x
   where en_tabla < en_json;
  if faltantes > 0 then
    raise exception 'Migración incompleta, no se aplicó ningún cambio: %', detalle;
  end if;

  insert into public.migraciones_aplicadas (nombre, detalle)
  values ('v6_compras', insertados || ' compras migradas desde descripcion_venta');
end $$;

commit;


-- ----------------------------------------------------------------------------
-- 6. RESUMEN
-- ----------------------------------------------------------------------------
select 'compras en tabla' as chequeo, count(*)::text as resultado from public.compras
union all
select 'compras abiertas', count(*)::text from public.compras where estado not in ('Recibido', 'Cancelado')
union all
select 'compras sin fecha prometida', count(*)::text from public.compras
 where fecha_prometida is null and estado not in ('Recibido', 'Cancelado')
union all
select 'migración', coalesce((select detalle from public.migraciones_aplicadas where nombre = 'v6_compras'), 'NO APLICADA');
