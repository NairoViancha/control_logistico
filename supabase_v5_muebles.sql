-- ============================================================================
-- MODUGAL · v5 · Fase 2 (parte 1): MUEBLES EN TABLA PROPIA
-- ----------------------------------------------------------------------------
-- Saca los muebles del JSON de descripcion_venta a public.proyecto_muebles.
--
-- Seguridad de la migración:
--   1. Todo corre en UNA transacción: si algo falla, no cambia nada.
--   2. Antes de migrar se guarda un respaldo completo de descripcion_venta.
--   3. Al final se comparan los conteos (JSON vs tabla) proyecto por proyecto;
--      si no cuadran, se aborta y se deshace todo.
--   4. El JSON NO se borra aquí. La app deja de escribir muebles en el JSON
--      al guardar cada proyecto; el respaldo conserva la versión original.
-- Requiere v4. Idempotente: si se vuelve a ejecutar, no duplica muebles.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. RESPALDO de descripcion_venta (solo accesible desde el SQL Editor)
-- ----------------------------------------------------------------------------
create table if not exists public.respaldo_descripcion_venta (
  proyecto_id       uuid,
  codigo_prj        text,
  descripcion_venta text,
  respaldado_en     timestamptz not null default now(),
  motivo            text
);
alter table public.respaldo_descripcion_venta enable row level security;  -- sin políticas: la app no la ve
revoke all on public.respaldo_descripcion_venta from anon, authenticated;

insert into public.respaldo_descripcion_venta (proyecto_id, codigo_prj, descripcion_venta, motivo)
select id, codigo_prj, descripcion_venta, 'v5 · antes de migrar muebles'
  from public.proyectos
 where not exists (select 1 from public.respaldo_descripcion_venta r
                    where r.motivo = 'v5 · antes de migrar muebles');


-- ----------------------------------------------------------------------------
-- 2. TABLA proyecto_muebles
-- ----------------------------------------------------------------------------
create table if not exists public.proyecto_muebles (
  id                 uuid primary key default gen_random_uuid(),
  proyecto_id        uuid not null references public.proyectos (id) on delete cascade,
  nombre             text not null check (length(trim(nombre)) > 0),
  fase               text not null default 'Recepción'
                     check (fase in ('Recepción', 'Asignación', 'Armado', 'Presentación', 'Embalaje', 'Despacho')),
  responsable_id     uuid references public.carpinteros (id) on delete set null,
  responsable_nombre text,   -- respaldo cuando el nombre antiguo no coincide con el personal registrado
  actividad          text not null default 'Armando'
                     check (actividad in ('Trazando', 'Escogiendo material', 'Armando', 'Añadiendo luces',
                                          'Embalaje', 'Instalación', 'Otra')),
  detalle            text,
  orden              integer not null default 0,
  legacy_id          text,   -- id que tenía dentro del JSON (trazabilidad de la migración)
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (proyecto_id, legacy_id)
);

create index if not exists proyecto_muebles_proyecto_idx    on public.proyecto_muebles (proyecto_id, orden);
create index if not exists proyecto_muebles_responsable_idx on public.proyecto_muebles (responsable_id);
create index if not exists proyecto_muebles_fase_idx        on public.proyecto_muebles (fase);

-- Versión para concurrencia optimista (igual que proyectos)
create or replace function public.versionar_fila()
returns trigger
language plpgsql
as $$
declare
  control text[] := array['version', 'updated_at'];
begin
  if (to_jsonb(new) - control) = (to_jsonb(old) - control) then
    new.version    := old.version;
    new.updated_at := old.updated_at;
  else
    new.version    := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_versionar_mueble on public.proyecto_muebles;
create trigger trg_versionar_mueble
  before update on public.proyecto_muebles
  for each row execute function public.versionar_fila();

-- Historial (reutiliza el trigger de la v4; ubica el proyecto por proyecto_id)
drop trigger if exists trg_historial on public.proyecto_muebles;
create trigger trg_historial
  after insert or update or delete on public.proyecto_muebles
  for each row execute function public.registrar_evento();


-- ----------------------------------------------------------------------------
-- 3. PERMISOS: ver todos los aprobados; crear/editar/borrar Gerencia y Logística
-- ----------------------------------------------------------------------------
alter table public.proyecto_muebles enable row level security;

drop policy if exists muebles_select on public.proyecto_muebles;
drop policy if exists muebles_write  on public.proyecto_muebles;
create policy muebles_select on public.proyecto_muebles
  for select to authenticated using (public.mi_rol() is not null);
create policy muebles_write on public.proyecto_muebles
  for all to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo']))
  with check (public.tiene_rol(array['administrativo', 'operativo']));

-- El historial de muebles también lo ven Logística y Secretaría
drop policy if exists historial_select on public.historial_eventos;
create policy historial_select on public.historial_eventos
  for select to authenticated
  using (
    public.tiene_rol(array['administrativo'])
    or (public.tiene_rol(array['operativo', 'secretaria'])
        and tabla in ('proyectos', 'pendientes', 'tareas_carpintero', 'carpinteros', 'proyecto_muebles'))
  );

-- Tiempo real
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proyecto_muebles') then
    alter publication supabase_realtime add table public.proyecto_muebles;
  end if;
end $$;


-- Secretaría: con los muebles en su tabla, la app deja de enviarlos en el JSON.
-- La regla de la v4 solo aplica si el JSON todavía trae muebles (la tabla ya
-- está protegida por su propia RLS: Secretaría no puede escribir en ella).
create or replace function public.proteger_fase_proyecto()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and public.mi_rol() = 'secretaria' then
    if new.fase_actual is distinct from old.fase_actual then
      raise exception 'Secretaría no puede cambiar la fase de producción';
    end if;
    if coalesce(public.mg_json(new.descripcion_venta) ? 'muebles', false)
       and public.muebles_operativos(new.descripcion_venta)
           is distinct from public.muebles_operativos(old.descripcion_venta) then
      raise exception 'Secretaría no puede cambiar responsables ni fases de los muebles';
    end if;
  end if;
  return new;
end $$;


-- ----------------------------------------------------------------------------
-- 4. MIGRACIÓN desde el JSON — se ejecuta UNA sola vez (queda marcada), para
--    que volver a correr el script nunca reviva muebles que se borraron luego.
-- ----------------------------------------------------------------------------
create table if not exists public.migraciones_aplicadas (
  nombre      text primary key,
  aplicada_en timestamptz not null default now(),
  detalle     text
);
alter table public.migraciones_aplicadas enable row level security;
revoke all on public.migraciones_aplicadas from anon, authenticated;

do $$
declare
  insertados integer;
  faltantes  integer;
  detalle    text;
begin
  if exists (select 1 from public.migraciones_aplicadas where nombre = 'v5_muebles') then
    raise notice 'La migración de muebles ya se había aplicado: no se repite.';
    return;
  end if;

  insert into public.proyecto_muebles
    (proyecto_id, nombre, fase, responsable_id, responsable_nombre, actividad, detalle, orden, legacy_id)
  select p.id,
         coalesce(nullif(trim(m.valor ->> 'name'), ''), 'Mueble ' || m.ord),
         case when m.valor ->> 'manufacturingPhase' in ('Recepción', 'Asignación', 'Armado', 'Presentación', 'Embalaje', 'Despacho')
              then m.valor ->> 'manufacturingPhase' else 'Recepción' end,
         c.id,
         nullif(trim(m.valor ->> 'carpenter'), ''),
         case when m.valor ->> 'actividad' in ('Trazando', 'Escogiendo material', 'Armando', 'Añadiendo luces',
                                                'Embalaje', 'Instalación', 'Otra')
              then m.valor ->> 'actividad' else 'Armando' end,
         nullif(trim(m.valor ->> 'detalle'), ''),
         (m.ord - 1)::integer,
         coalesce(m.valor ->> 'id', '') || '#' || m.ord
    from public.proyectos p
    cross join lateral jsonb_array_elements(
           case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'muebles') = 'array'
                then public.mg_json(p.descripcion_venta) -> 'muebles' else '[]'::jsonb end
         ) with ordinality as m(valor, ord)
    left join lateral (
           select id from public.carpinteros
            where lower(trim(nombre)) = lower(trim(m.valor ->> 'carpenter'))
            order by activo desc
            limit 1
         ) c on true
  on conflict (proyecto_id, legacy_id) do nothing;
  get diagnostics insertados = row_count;

  -- VERIFICACIÓN: cada mueble del JSON debe existir en la tabla
  select count(*), string_agg(codigo_prj || ' (' || en_json || ' en JSON / ' || en_tabla || ' en tabla)', ', ')
    into faltantes, detalle
    from (
      select p.codigo_prj,
             jsonb_array_length(public.mg_json(p.descripcion_venta) -> 'muebles') as en_json,
             (select count(*) from public.proyecto_muebles pm
               where pm.proyecto_id = p.id and pm.legacy_id is not null) as en_tabla
        from public.proyectos p
       where jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'muebles') = 'array'
    ) x
   where en_tabla < en_json;
  if faltantes > 0 then
    raise exception 'Migración incompleta, no se aplicó ningún cambio: %', detalle;
  end if;

  insert into public.migraciones_aplicadas (nombre, detalle)
  values ('v5_muebles', insertados || ' muebles migrados desde descripcion_venta');
end $$;

commit;


-- ----------------------------------------------------------------------------
-- 6. RESUMEN
-- ----------------------------------------------------------------------------
select 'muebles en tabla' as chequeo, count(*)::text as resultado from public.proyecto_muebles
union all
select 'muebles sin responsable registrado',
       count(*)::text from public.proyecto_muebles where responsable_id is null and responsable_nombre is not null
union all
select 'proyectos respaldados', count(distinct codigo_prj)::text from public.respaldo_descripcion_venta
union all
select 'migración', coalesce((select detalle from public.migraciones_aplicadas where nombre = 'v5_muebles'), 'NO APLICADA');
