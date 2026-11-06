/* Copia los archivos de la app web a www/ (la carpeta que Capacitor empaqueta
   dentro de la app de iOS y Android). Se ejecuta con: npm run web */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'www');
const archivos = ['index.html', 'ciudades.js', 'app.js', 'styles.css', 'manifest.webmanifest', 'icons'];

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const a of archivos) {
  const origen = join(raiz, a);
  if (!existsSync(origen)) { console.error(`Falta ${a}`); process.exit(1); }
  cpSync(origen, join(destino, a), { recursive: true });
}
console.log(`Listo: ${archivos.length} elementos copiados a www/ (sin sw.js: la app nativa no lo necesita).`);
