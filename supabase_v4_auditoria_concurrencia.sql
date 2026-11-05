-- ============================================================================
-- MODUGAL · v4 · Trazabilidad, concurrencia e integridad
-- ----------------------------------------------------------------------------
-- 1. historial_eventos: quién cambió qué, valor anterior y nuevo, cuándo y
--    por qué. Lo escribe la base (triggers), nadie lo puede editar ni borrar.
-- 2. proyectos.version: control de concurrencia optimista (si dos personas
--    editan el mismo proyecto, la segunda no pisa a la primera).
-- 3. Borrado en cascada: al borrar un proyecto se borran sus pendientes,
--    tareas y finanzas en la misma operación (sin registros huérfanos).
-- 4. Secretaría no puede cambiar responsables ni fases de los muebles.
-- Requiere supabase_auth_rls.sql y supabase_v3. Idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. COLUMNAS DE CONTROL EN proyectos
-- ----------------------------------------------------------------------------
alter table public.proyectos add column if not exists version       integer not null default 1;
alter table public.proyectos add column if not exists updated_at    timestamptz not null default now();
-- Motivo opcional del cambio: la app lo envía junto con el cambio; el trigger
-- lo pasa al historial y nunca queda guardado en la fila.
alter table public.proyectos add column if not exists motivo_cambio text;

create or replace function public.versionar_proyecto()
returns trigger
language plpgsql
as $$
declare
  control text[] := array['version', 'updated_at', 'motivo_cambio'];
begin
  -- El motivo se pasa al trigger de historial (misma transacción) y se limpia
  perform set_config('modugal.motivo', coalesce(new.motivo_cambio, ''), true);
  new.motivo_cambio := null;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - control) = (to_jsonb(old) - control) then
      -- Guardado sin cambios reales: la versión no se mueve
      new.version    := old.version;
      new.updated_at := old.updated_at;
    else
      new.version    := old.version + 1;
      new.updated_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_versionar_proyecto on public.proyectos;
create trigger trg_versionar_proyecto
  before insert or update on public.proyectos
  for each row execute function public.versionar_proyecto();


-- ----------------------------------------------------------------------------
-- 2. BORRADO EN CASCADA (pendientes y tareas → proyectos)
--    Se recrean las llaves foráneas existentes con ON DELETE CASCADE.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabla, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.confrelid = 'public.proyectos'::regclass
       and c.conrelid in ('public.pendientes'::regclass, 'public.tareas_carpintero'::regclass)
       and c.confdeltype <> 'c'
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.proyectos (id) on delete cascade',
                   r.tabla, r.conname, r.columna);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 3. SECRETARÍA: no cambia fase del proyecto NI responsables/fases de muebles
--    (los muebles viajan en descripcion_venta; se comparan sus campos clave).
-- ----------------------------------------------------------------------------
create or replace function public.muebles_operativos(raw text)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m ->> 'id',
           'carpenter', m ->> 'carpenter',
           'manufacturingPhase', m ->> 'manufacturingPhase',
           'actividad', m ->> 'actividad') order by m ->> 'id'), '[]'::jsonb)
    from jsonb_array_elements(coalesce(public.mg_json(raw) -> 'muebles', '[]'::jsonb)) m;
$$;

create or replace function public.proteger_fase_proyecto()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and public.mi_rol() = 'secretaria' then
    if new.fase_actual is distinct from old.fase_actual then
      raise exception 'Secretaría no puede cambiar la fase de producción';
    end if;
    if public.muebles_operativos(new.descripcion_venta)
       is distinct from public.muebles_operativos(old.descripcion_venta) then
      raise exception 'Secretaría no puede cambiar responsables ni fases de los muebles';
    end if;
  end if;
  return new;
end $$;


-- ----------------------------------------------------------------------------
-- 4. HISTORIAL DE EVENTOS (auditoría)
-- ----------------------------------------------------------------------------
create table if not exists public.historial_eventos (
  id             bigint generated always as identity primary key,
  tabla          text not null,
  registro_id    text,
  codigo_prj     text,
  accion         text not null check (accion in ('crear', 'modificar', 'eliminar')),
  cambios        jsonb not null default '{}'::jsonb,
  motivo         text,
  usuario_id     uuid,
  usuario_nombre text,
  usuario_rol    text,
  creado_en      timestamptz not null default now()
);

create index if not exists historial_codigo_idx on public.historial_eventos (codigo_prj, creado_en desc);
create index if not exists historial_fecha_idx  on public.historial_eventos (creado_en desc);

-- Diferencia campo a campo entre dos versiones de una fila.
-- descripcion_venta se abre (MGJSON) y se compara por secciones de la ficha.
create or replace function public.diferencias(viejo jsonb, nuevo jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  k text;
  res jsonb := '{}'::jsonb;
  ignorar text[] := array['updated_at', 'version', 'motivo_cambio', 'created_at', 'aprobado_en', 'aprobado_por', 'updated_by'];
  pv jsonb; pn jsonb;
begin
  for k in select distinct key from (
             select jsonb_object_keys(coalesce(viejo, '{}'::jsonb)) as key
             union select jsonb_object_keys(coalesce(nuevo, '{}'::jsonb))) x
  loop
    continue when k = any (ignorar);
    if k = 'descripcion_venta' then
      pv := coalesce(public.mg_json(viejo ->> k), '{}'::jsonb);
      pn := coalesce(public.mg_json(nuevo ->> k), '{}'::jsonb);
      res := res || (select coalesce(jsonb_object_agg('ficha.' || s.key,
                       jsonb_build_object('antes', pv -> s.key, 'despues', pn -> s.key)), '{}'::jsonb)
                       from (select jsonb_object_keys(pv) as key union select jsonb_object_keys(pn)) s
                      where (pv -> s.key) is distinct from (pn -> s.key));
    elsif (viejo -> k) is distinct from (nuevo -> k) then
      res := res || jsonb_build_object(k, jsonb_build_object('antes', viejo -> k, 'despues', nuevo -> k));
    end if;
  end loop;
  return res;
end $$;

create or replace function public.registrar_evento()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_fila jsonb := coalesce(v_new, v_old);
  v_cambios jsonb;
  v_codigo text;
  v_motivo text;
  v_usuario record;
begin
  if tg_op = 'UPDATE' then
    v_cambios := public.diferencias(v_old, v_new);
    if v_cambios = '{}'::jsonb then
      return null;  -- guardado sin cambios reales: no se registra
    end if;
  elsif tg_op = 'INSERT' then
    v_cambios := public.diferencias('{}'::jsonb, v_new);
  else
    v_cambios := public.diferencias(v_old, '{}'::jsonb);
  end if;

  -- Proyecto al que pertenece el evento
  if tg_table_name = 'proyectos' then
    v_codigo := v_fila ->> 'codigo_prj';
    v_motivo := nullif(trim(current_setting('modugal.motivo', true)), '');
    perform set_config('modugal.motivo', '', true);
  elsif v_fila ? 'proyecto_id' and (v_fila ->> 'proyecto_id') is not null then
    select codigo_prj into v_codigo from public.proyectos where id = (v_fila ->> 'proyecto_id')::uuid;
  end if;

  select nombre, rol into v_usuario from public.usuarios where id = auth.uid();

  insert into public.historial_eventos
    (tabla, registro_id, codigo_prj, accion, cambios, motivo, usuario_id, usuario_nombre, usuario_rol)
  values
    (tg_table_name,
     coalesce(v_fila ->> 'id', v_fila ->> 'proyecto_id'),
     v_codigo,
     case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'modificar' else 'eliminar' end,
     v_cambios,
     v_motivo,
     auth.uid(),
     coalesce(v_usuario.nombre, case when auth.uid() is null then 'Sistema / SQL' end),
     v_usuario.rol);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['proyectos', 'pendientes', 'tareas_carpintero', 'carpinteros',
                           'usuarios', 'proyectos_finanzas']
  loop
    execute format('drop trigger if exists trg_historial on public.%I', t);
    execute format('create trigger trg_historial after insert or update or delete on public.%I
                    for each row execute function public.registrar_evento()', t);
  end loop;
end $$;

drop trigger if exists trg_limpiar_motivo on public.proyectos;
drop function if exists public.limpiar_motivo_cambio();

-- Solo lectura para la app: nadie inserta, edita ni borra historial a mano
alter table public.historial_eventos enable row level security;
drop policy if exists historial_select on public.historial_eventos;
create policy historial_select on public.historial_eventos
  for select to authenticated
  using (
    public.tiene_rol(array['administrativo'])
    or (public.tiene_rol(array['operativo', 'secretaria'])
        and tabla in ('proyectos', 'pendientes', 'tareas_carpintero', 'carpinteros'))
  );
revoke insert, update, delete, truncate on public.historial_eventos from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. COMPROBACIÓN
-- ----------------------------------------------------------------------------
select 'proyectos versionados' as chequeo, count(*)::text as resultado from public.proyectos
union all
select 'llaves con cascada', (select count(*)::text from pg_constraint
                               where contype = 'f' and confrelid = 'public.proyectos'::regclass and confdeltype = 'c')
union all
select 'tablas auditadas', (select string_agg(event_object_table, ', ' order by event_object_table)
                              from (select distinct event_object_table from information_schema.triggers
                                     where trigger_name = 'trg_historial') x);
