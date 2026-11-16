// Superadministradores: SOLO se crean desde la consola del servidor (nunca desde la web).
//
//   npm run superadmin -- --username cvaca --password "xxxx" [--name "Nombre"] [--email x@y.com]
//   npm run superadmin -- --username cvaca --reset-password [--password "nueva"]
//   npm run superadmin -- --list
//
// Si no pasas --password se genera una contraseña segura y se muestra UNA sola vez.
import { parseArgs } from 'node:util';
import { prisma } from '../src/lib/prisma.js';
import { audit } from '../src/lib/audit.js';
import { generatePassword, hashPassword } from '../src/lib/passwords.js';
import { emailField, usernameField } from '../src/modules/auth/auth.schema.js';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    password: { type: 'string' },
    'reset-password': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
  },
});

const ctx = { ip: 'cli', userAgent: 'scripts/create-superadmin.js' };

try {
  if (values.list) {
    const list = await prisma.user.findMany({ where: { role: 'superadmin' }, orderBy: { createdAt: 'asc' } });
    console.log(list.length ? '' : '\nNo hay superadmins.');
    for (const u of list) console.log(`  ${u.username.padEnd(20)} ${u.name.padEnd(25)} ${u.status}`);
    process.exit(0);
  }

  const username = usernameField.safeParse(values.username);
  if (!username.success) fail(`--username: ${username.error.issues[0].message}`);

  const password = values.password ?? generatePassword();
  // Desde consola se aceptan contraseñas de 6+ caracteres (decisión del dueño); la web exige 8+.
  if (password.length < 6 || password.length > 72) fail('La contraseña debe tener entre 6 y 72 caracteres');
  if (password.length < 8) console.warn('\n⚠ Contraseña corta (menos de 8 caracteres). Se recomienda cambiarla en producción.');

  const existing = await prisma.user.findUnique({ where: { username: username.data } });

  if (values['reset-password']) {
    if (existing?.role !== 'superadmin') fail(`No existe un superadmin con usuario "${username.data}".`);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 }, status: 'active' },
      }),
      audit(prisma, { ctx, orgId: null, action: 'password_reset', entity: 'user', entityId: existing.id }),
    ]);
    done(existing.username, password, 'Contraseña del superadmin restablecida.');
  } else {
    if (existing) fail(`El usuario "${username.data}" ya existe. Usa --reset-password para cambiar su contraseña.`);
    let email;
    if (values.email) {
      const e = emailField.safeParse(values.email);
      if (!e.success) fail('--email no es un correo válido');
      email = e.data;
    }
    const name = values.name?.trim() || username.data;

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { username: username.data, email, name, role: 'superadmin', passwordHash: await hashPassword(password) },
      });
      await audit(tx, { ctx, orgId: null, action: 'create', entity: 'user', entityId: u.id, changes: { username: u.username, role: 'superadmin' } });
      return u;
    });
    done(user.username, password, 'Superadmin creado.');
  }
} finally {
  await prisma.$disconnect();
}

function done(username, pass, msg) {
  console.log(`\n✔ ${msg}\n  Usuario:    ${username}`);
  if (!values.password) console.log(`  Contraseña: ${pass}\n  (Guárdala ahora: no se volverá a mostrar.)`);
  console.log('');
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
