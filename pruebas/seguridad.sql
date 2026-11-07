-- ============================================================================
-- MODUGAL · Pruebas de seguridad de la base (RLS, triggers y v13)
-- ----------------------------------------------------------------------------
-- NO correr en producción: crea usuarios de prueba. Usar en una copia/local:
--   psql "$DB_URL" -f pruebas/seguridad.sql
-- Todo va en UNA transacción que se deshace al final (rollback).
-- Cada línea "ESPERADO:" dice el resultado correcto.
-- ============================================================================
\set ON_ERROR_STOP off
\set ON_ERROR_ROLLBACK on
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'ger@prueba.co'),
  ('a0000000-0000-4000-8000-000000000002', 'log@prueba.co'),
  ('a0000000-0000-4000-8000-000000000003', 'sec@prueba.co'),
  ('a0000000-0000-4000-8000-000000000004', 'arq@prueba.co'),
  ('a0000000-0000-4000-8000-000000000005', 'pend@prueba.co')
on conflict do nothing;
update public.usuarios set estado_aprobacion = 'aprobado', rol = case email
  when 'ger@prueba.co' then 'administrativo' when 'log@prueba.co' then 'operativo'
  when 'sec@prueba.co' then 'secretaria' else 'arquitecto' end
 where email in ('ger@prueba.co', 'log@prueba.co', 'sec@prueba.co', 'arq@prueba.co');
insert into public.proyectos (codigo_prj, cliente, ciudad, descripcion_venta) values ('PRJ-T1', 'Cliente T', 'Bogotá D.C.', 'MGJSON:{}'), ('PRJ-T2', 'Cliente T2', 'Cali', 'MGJSON:{}');
insert into public.compras (proyecto_id, material, proveedor) select id, 'Tablero T', 'Prov' from public.proyectos where codigo_prj = 'PRJ-T1';

\echo '1. anon no lee tablas (ESPERADO: permission denied)'
set local role anon;
select count(*) from public.proyectos;
select public.mi_rol();
reset role;

\echo '2. usuario pendiente no ve nada (ESPERADO: 0)'
set local role authenticated; set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000005';
select count(*) as proyectos_visibles from public.proyectos;
\echo '3. pendiente no se aprueba a sí mismo (ESPERADO: error Solo Gerencia)'
update public.usuarios set estado_aprobacion = 'aprobado', rol = 'administrativo' where id = auth.uid();
reset role;

\echo '4. arquitecto: lee pero no edita proyectos (ESPERADO: UPDATE 0)'
set local role authenticated; set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000004';
update public.proyectos set cliente = 'hackeado' where codigo_prj = 'PRJ-T1';
\echo '5. arquitecto no ve finanzas (ESPERADO: 0)'
select count(*) from public.proyectos_finanzas;
\echo '6. arquitecto no escribe historial (ESPERADO: permission denied)'
insert into public.historial_eventos (tabla, accion) values ('proyectos', 'crear');
reset role;

\echo '7. secretaría no liga un incidente a una compra (ESPERADO: error Solo Gerencia o Logística)'
set local role authenticated; set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
insert into public.incidentes (proyecto_id, tipo, gravedad, descripcion, compra_id)
  select c.proyecto_id, 'Otro', 'Media', 'x', c.id from public.compras c where material = 'Tablero T';
reset role;

\echo '8. compra de otro proyecto (ESPERADO: error no pertenece a este proyecto)'
set local role authenticated; set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';
insert into public.incidentes (proyecto_id, tipo, gravedad, descripcion, compra_id)
  select (select id from public.proyectos where codigo_prj = 'PRJ-T2'), 'Otro', 'Media', 'x', c.id from public.compras c where material = 'Tablero T';
\echo '9. logística liga compra del mismo proyecto (ESPERADO: INSERT 0 1)'
insert into public.incidentes (proyecto_id, tipo, gravedad, descripcion, compra_id)
  select c.proyecto_id, 'Material defectuoso', 'Media', 'x', c.id from public.compras c where material = 'Tablero T';
\echo '10. logística no borra proyectos (ESPERADO: DELETE 0)'
delete from public.proyectos where codigo_prj = 'PRJ-T1';
reset role;

\echo '11. usuario no falsea aprobado_por/aprobado_en (ESPERADO: t)'
set local role authenticated; set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
update public.usuarios set aprobado_en = '2000-01-01' where id = auth.uid() returning aprobado_en is distinct from '2000-01-01' as protegido;
reset role;

\echo '12. documento con tipo HTML (ESPERADO: error documentos_tipo_mime_check)'
set local role authenticated; set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
insert into public.documentos (proyecto_id, carpeta, categoria, nombre, ruta, tipo_mime)
  select id, 'proyecto', 'Planimetría', 'x.html', 'documentos-proyecto/' || id || '/x.html', 'text/html' from public.proyectos where codigo_prj = 'PRJ-T1';
\echo '13. texto gigante (ESPERADO: error *_largo)'
insert into public.carpinteros (nombre, cargo) values (repeat('x', 500), 'Carpintero');
\echo '14. gerencia no se quita su propio rol (ESPERADO: error No puedes cambiar tu propio rol)'
update public.usuarios set rol = 'arquitecto' where id = auth.uid();
reset role;

rollback;
\echo 'Listo: todo se deshizo (rollback).'
