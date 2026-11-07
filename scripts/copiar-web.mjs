/* Copia los archivos de la app a una carpeta lista para publicar.
     node scripts/copiar-web.mjs        → www/  (app nativa con Capacitor; sin sw.js)
     node scripts/copiar-web.mjs --web  → dist/ (Cloudflare Pages; con sw.js y _headers)
   Así solo se publican los archivos de la app: nunca los .sql, pruebas ni config. */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = process.argv.includes('--web');
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, web ? 'dist' : 'www');
const archivos = ['index.html', 'ciudades.js', 'app.js', 'styles.css', 'manifest.webmanifest', 'icons'];
if (web) archivos.push('sw.js', '_headers');

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const a of archivos) {
  const origen = join(raiz, a);
  if (!existsSync(origen)) { console.error(`Falta ${a}`); process.exit(1); }
  cpSync(origen, join(destino, a), { recursive: true });
}
console.log(`Listo: ${archivos.length} elementos copiados a ${web ? 'dist/' : 'www/ (sin sw.js: la app nativa no lo necesita)'}.`);
