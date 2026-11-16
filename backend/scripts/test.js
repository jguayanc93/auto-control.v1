// Lanza Vitest con la ruta de trabajo normalizada.
// Windows: si la terminal abre la carpeta como "c:\..." (minúscula, típico de VS Code),
// Vitest carga sus módulos dos veces y falla con "failed to find the runner".
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fix = (p) => (process.platform === 'win32' ? p.replace(/^[a-z]:/, (d) => d.toUpperCase()) : p);
const root = fix(fileURLToPath(new URL('..', import.meta.url)));
const vitest = fix(fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)));

const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
