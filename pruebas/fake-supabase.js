(function(){
  const G='u1', A='u2', N='u3';
  const db = {
    usuarios: [
      {id:G, email:'nairovianchacortes@gmail.com', nombre:'Nairo Viancha', rol:'administrativo', cargo_solicitado:'administrativo', estado_aprobacion:'aprobado', created_at:'2026-11-04T10:00:00Z'},
      {id:A, email:'arq@x.com', nombre:'Felipe Mora', rol:'arquitecto', cargo_solicitado:'arquitecto', estado_aprobacion:'aprobado', created_at:'2026-11-04T11:00:00Z'},
      {id:N, email:'nuevo@x.com', nombre:'Laura Gómez', rol:'arquitecto', cargo_solicitado:'secretaria', estado_aprobacion:'pendiente', created_at:'2026-11-05T01:00:00Z'},
    ],
    proyecto_muebles: (localStorage.getItem('modo')==='tabla') ? [{id:'aaaaaaaa-0000-4000-8000-000000000001', proyecto_id:'p1', nombre:'Isla', fase:'Armado', responsable_id:'c1', responsable_nombre:'Carlos Martinez', actividad:'Añadiendo luces', detalle:'LED', orden:0, version:1, estado_trabajo:'En proceso'}] : undefined,
    compras: (localStorage.getItem('modo')==='tabla') ? [
      {id:'bbbbbbbb-0000-4000-8000-000000000001', proyecto_id:'p1', categoria:'Herrajes Blum', material:'Bisagras', cantidad:20, unidad:'und', cantidad_recibida:0, proveedor:'Serviherrajes', numero_guia:null, fecha_solicitud:'2026-10-20', fecha_prometida:'2026-11-01', fecha_recibida:null, estado:'Solicitado', control_calidad:'Pendiente', notas:null, pendiente_id:null, version:1},
      {id:'bbbbbbbb-0000-4000-8000-000000000002', proyecto_id:'p1', categoria:'Madecor / Tableros', material:'Tablero RH', cantidad:8, unidad:'láminas', cantidad_recibida:8, proveedor:'Pelikano', numero_guia:'GUI-1', fecha_solicitud:'2026-10-20', fecha_prometida:'2026-10-30', fecha_recibida:'2026-10-29', estado:'Recibido', control_calidad:'Aprobado', notas:null, pendiente_id:null, version:2}] : undefined,
    incidentes: (localStorage.getItem('modo')==='tabla') ? [
      {id:'cccccccc-0000-4000-8000-000000000001', proyecto_id:'p1', tipo:'Otro', gravedad:'Alta', descripcion:'Falta herraje Blum', accion:'Llamar proveedor', responsable:'Serviherrajes', detiene_produccion:true, estado:'Abierto', fecha_apertura:'2026-11-01T15:00:00Z', fecha_compromiso:'2026-11-03', fecha_cierre:null, solucion:null, dias_impacto:2, compra_id:null, version:1}] : undefined,
    historial_eventos: [{id:1, tabla:'proyectos', codigo_prj:'PRJ-001', accion:'modificar', cambios:{ciudad:{antes:'Bucaramanga',despues:'Bogotá'}, 'ficha.muebles':{antes:[{id:'m1',name:'Isla',carpenter:'Carlos Martinez',manufacturingPhase:'Armado'}], despues:[{id:'m1',name:'Isla',carpenter:'Andrés Luz',manufacturingPhase:'Embalaje'},{id:'m2',name:'Closet'}]}}, motivo:'Fecha de entrega: 10 Nov 2026 → 20 Nov 2026. Motivo: Retraso de herrajes', usuario_nombre:'Nairo Viancha', usuario_rol:'administrativo', creado_en:'2026-11-05T22:10:00Z'},
      {id:2, tabla:'pendientes', codigo_prj:'PRJ-001', accion:'crear', cambios:{descripcion:{antes:null,despues:'Falta herraje [material|alta]'}}, usuario_nombre:'Wilyer', usuario_rol:'operativo', creado_en:'2026-11-05T22:30:00Z'}],
    proyectos: [{id:'p1', version:3, codigo_prj:'PRJ-001', cliente:'Martha Pinos', ciudad:'Bucaramanga', descripcion_venta:'MGJSON:{"name":"Cocina Martha","status":"Detenido","bloqueos":[{"id":"b1","reason":"Falta herraje Blum","action":"Llamar proveedor","solved":false}],"pedidos":[{"id":"x1","category":"Herrajes Blum","item":"Bisagras JSON","supplier":"Serviherrajes","guide":"Sin Guía","expected":"01 Nov 2026","status":"Solicitado","qc":"Pendiente"}],"muebles":[{"id":"m-mig-0","name":"Isla JSON","carpenter":"Carlos Martinez","manufacturingPhase":"Armado","actividad":"Añadiendo luces","detalle":"LED"}],"dropboxFiles":{"publicFiles":[{"name":"render.jpg"}]}}', fase_actual:'Armado', etapa_comercial:'En Fabricación', created_at:'2026-11-01'}],
    pendientes: [],
    documentos: (localStorage.getItem('modo')==='tabla') ? [
      {id:'dddddddd-0000-4000-8000-000000000001', proyecto_id:'p1', carpeta:'proyecto', categoria:'Plano 2D', nombre:'Plano cocina.pdf', ruta:'documentos-proyecto/p1/1-plano.pdf', tipo_mime:'application/pdf', tamano_bytes:245000, notas:null, created_at:'2026-11-04T15:00:00Z'},
      {id:'dddddddd-0000-4000-8000-000000000002', proyecto_id:'p1', carpeta:'proyecto', categoria:'Otro', nombre:'render.jpg', ruta:null, tipo_mime:null, tamano_bytes:null, notas:'Referencia antigua', created_at:'2026-11-03T15:00:00Z'},
      {id:'dddddddd-0000-4000-8000-000000000003', proyecto_id:'p1', carpeta:'financiera', categoria:'Cotización', nombre:'Cotizacion_Martha.pdf', ruta:'documentos-financieros/p1/2-cot.pdf', tipo_mime:'application/pdf', tamano_bytes:88000, notas:null, created_at:'2026-11-04T16:00:00Z'}] : undefined,
    carpinteros: [{id:'c1', nombre:'Carlos Martinez', cargo:'Carpintero', activo:true},{id:'c2', nombre:'Teofilo Gutierrez', cargo:'Carpintero', activo:true},{id:'c3', nombre:'Andrés Luz', cargo:'Eléctrico', activo:true},{id:'c4', nombre:'Viejo Operario', cargo:'Carpintero', activo:false}],
    tareas_carpintero: [{id:'11111111-1111-4111-8111-111111111111', carpintero_id:'c1', proyecto_id:'p1', nombre_mueble:'Isla', fase_manual:'Armado', estado_tarea:'En proceso', actividad:'Escogiendo material', detalle:'Material Ámbar', grupo_id:null, es_lider:false}],
    proyectos_finanzas: [{proyecto_id:'p1', valor_venta:20000000, costo_materiales:8000000, costo_mano_obra:4000000, otros_costos:0, anticipo:10000000, notas:'50% anticipo', archivos_privados:[{name:'Cotizacion_Martha.pdf'}]}],
  };
  const pass = {'nairovianchacortes@gmail.com':'clave123','arq@x.com':'clave123','nuevo@x.com':'clave123'};
  let session = null;
  const esRecuperacion = /type=recovery/.test(location.hash);
  const listeners = [];
  const emit = (ev) => listeners.forEach(cb => cb(ev, session));
  window.__db = db; window.__writes = [];
  const yo = () => db.usuarios.find(u => u.id === session?.user?.id);
  const aprobado = () => yo()?.estado_aprobacion === 'aprobado';
  const rls = (table, rows) => {
    if (!session) return [];
    if (table === 'usuarios') return yo()?.rol==='administrativo' && aprobado() ? rows : rows.filter(r => r.id === session.user.id);
    if (!aprobado()) return [];
    if (table === 'proyectos_finanzas') return yo().rol === 'administrativo' ? rows : [];
    if (table === 'documentos') return yo().rol === 'administrativo' ? rows : rows.filter(r => r.carpeta !== 'financiera');
    return rows;
  };
  function q(table){ (window.__lecturas = window.__lecturas || []).push(table);
    const filtros = []; let op = 'select', payload = null;
    const run = () => {
      if (!db[table]) return {data:null, error:{code:'PGRST205', message:"Could not find the table 'public."+table+"'"}};
      let rows = rls(table, db[table]).filter(r => filtros.every(([c,v]) => r[c] === v));
      if (window.__offline && table !== 'historial_eventos') return {data:null, error:{message:'Failed to fetch'}};
      if (op === 'update') {
        if (['proyectos','proyecto_muebles','compras','incidentes'].includes(table)) {
          const vf = filtros.find(([c]) => c === 'version');
          if (vf && rows.length && rows[0].version !== vf[1]) return {data:[], error:null};
          rows.forEach(r => { r.version = (r.version||1) + 1; });
        }
        if (table==='proyectos' && 'motivo_cambio' in payload) { window.__motivo = payload.motivo_cambio; }
        if (table === 'usuarios' && rows.some(r => r.id === session.user.id) && ('rol' in payload || 'estado_aprobacion' in payload)) return {data:null, error:{message:'No puedes cambiar tu propio rol ni tu estado de acceso'}};
        rows.forEach(r => Object.assign(r, payload)); window.__writes.push([table,'update',payload]); return {data: rows.map(r=>({...r})), error:null};
      }
      if (op === 'upsert') {
        if (table === 'proyectos_finanzas' && yo().rol !== 'administrativo') return {data:null, error:{message:'RLS'}};
        const ex = db[table].find(r => r.proyecto_id === payload.proyecto_id);
        if (ex) Object.assign(ex, payload); else db[table].push({...payload});
        window.__writes.push([table,'upsert',payload]); return {data:[payload], error:null};
      }
      return {data: rows.map(r=>({...r})), error:null};
    };
    const b = {
      select(){ return b; }, order(){ return b; }, limit(){ return b; },
      eq(c,v){ filtros.push([c,v]); return b; },
      like(){ return b; },
      in(){ return b; },
      update(p){ op='update'; payload=p; return b; },
      upsert(p){ op='upsert'; payload=p; return b; },
      insert(p){ if (window.__offline) { const e={data:null,error:{message:'Failed to fetch'}}; return {select(){return Promise.resolve(e);}, then(r){return Promise.resolve(e).then(r);}}; }
        if (table==='proyectos' && db.proyectos.some(x=>x.codigo_prj===(Array.isArray(p)?p[0]:p).codigo_prj)) { const e={data:null,error:{code:'23505',message:'duplicate key'}}; return {select(){return Promise.resolve(e);}, then(r){return Promise.resolve(e).then(r);}}; }
        if (['proyecto_muebles','compras','incidentes'].includes(table)) (Array.isArray(p)?p:[p]).forEach(r=>{ r.version=1; });
        if (table==='proyectos') { (Array.isArray(p)?p:[p]).forEach(r=>{ r.version=1; r.id=r.id||('px'+Math.random().toString(16).slice(2,8)); }); window.__ultimoInsertProyecto = p; }
        const rows=(Array.isArray(p)?p:[p]).map(r=>({id: r.id || ('n'+Math.random().toString(16).slice(2)), ...r}));
        if (table==='carpinteros' && yo().rol!=='administrativo') { const e={data:null,error:{message:'RLS carpinteros'}}; return {select(){return Promise.resolve(e);}, then(r){return Promise.resolve(e).then(r);}}; }
        rows.forEach(r=>db[table].push(r)); window.__writes.push([table,'insert',rows]);
        const ok={data:rows,error:null}; const one={data:rows[0],error:null}; return {select(){return {single(){return Promise.resolve(one);}, then(r){return Promise.resolve(ok).then(r);}};}, then(r){return Promise.resolve(ok).then(r);}}; },
      delete(){ return {eq(c,v){ let quitados=[]; if (db[table]) { quitados = db[table].filter(r=>r[c]===v); db[table] = db[table].filter(r=>r[c]!==v);} window.__writes.push([table,'delete',v]); const res={data:quitados.map(r=>({id:r.id})),error:null}; return {select(){return Promise.resolve(res);}, then(r,j){return Promise.resolve(res).then(r,j);}};}}; },
      maybeSingle(){ const r = run(); return Promise.resolve({data: r.data[0] || null, error: r.error}); },
      then(res, rej){ return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  const client = {
    from: q,
    channel(){ const ch = {on(){return ch;}, subscribe(cb){ cb && cb('SUBSCRIBED'); return ch;}}; return ch; },
    removeChannel(){},
    storage: { from(b){ return { async upload(path, blob, opts){ window.__upload={b,path,type:opts.contentType,size:blob.size}; return {data:{path},error:null}; }, async remove(paths){ (window.__removed=window.__removed||[]).push(b+'/'+paths[0]); return {data:[],error:null}; },
      async createSignedUrl(path, exp, opts){ window.__signed={b,path,exp,opts}; return {data:{signedUrl:'data:application/pdf;base64,JVBERi0='},error:null}; },
      getPublicUrl(path){ return {data:{publicUrl:'https://fake.supabase.co/storage/v1/object/public/'+b+'/'+path}}; } }; } },
    auth: {
      async getSession(){ if (esRecuperacion && !session) { const u = db.usuarios.find(x=>x.email==='nairovianchacortes@gmail.com'); session={user:{id:u.id,email:u.email}}; } return {data:{session}, error:null}; },
      onAuthStateChange(cb){ listeners.push(cb); if (esRecuperacion && !session) { const u = db.usuarios.find(x=>x.email==='nairovianchacortes@gmail.com'); session={user:{id:u.id,email:u.email}}; } setTimeout(()=>{ cb('INITIAL_SESSION', session); if (esRecuperacion) cb('PASSWORD_RECOVERY', session); },0); return {data:{subscription:{unsubscribe(){}}}}; },
      async signInWithPassword({email,password}){ if (pass[email]!==password) return {data:null, error:{message:'Invalid login credentials'}};
        const u = db.usuarios.find(x=>x.email===email); session={user:{id:u.id,email}}; emit('SIGNED_IN'); return {data:{session},error:null}; },
      async signUp(){ return {data:{user:{id:'u9',identities:[{}]}, session:null}, error:null}; },
      async signOut(){ session=null; emit('SIGNED_OUT'); return {error:null}; },
      async resetPasswordForEmail(){ return {error:null}; },
      async updateUser(a){ window.__nuevaClave = a.password; return {error:null}; },
    },
  };
  window.supabase = { createClient: () => client };
})();
