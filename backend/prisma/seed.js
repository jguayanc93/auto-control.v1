// Datos de prueba SOLO para desarrollo / demo local: 2 negocios, cada uno con su
// administrador y un operador. Contraseña de todos: Demo12345
// (Los superadmins NO se crean aquí: se crean con `npm run superadmin`.)
//
//   npm run db:seed
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/passwords.js';
import { addDays, toDbDate, todayISO } from '../src/lib/dates.js';
import { sha256 } from '../src/lib/documents.js';

if (env.isProd) {
  console.error('✖ El seed de demo no se ejecuta en producción.');
  process.exit(1);
}

const PASSWORD = 'Demo12345';

async function upsertUser(data) {
  return prisma.user.upsert({
    where: { username: data.username },
    update: {},
    create: { ...data, passwordHash: await hashPassword(PASSWORD) },
  });
}

async function business(name, admin, operator, createdById) {
  let org = await prisma.organization.findFirst({ where: { name } });
  org ??= await prisma.organization.create({ data: { name } });
  const a = await upsertUser({ ...admin, role: 'admin', orgId: org.id, createdById });
  await upsertUser({ ...operator, role: 'operator', orgId: org.id, createdById: a.id });
}

/** Vehículos, conductores y alquileres de ejemplo (solo si el negocio aún no tiene vehículos). */
async function demoFleet(orgName, adminUsername, vehicles) {
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org || (await prisma.vehicle.count({ where: { orgId: org.id } }))) return;
  const admin = await prisma.user.findUnique({ where: { username: adminUsername } });

  for (const { renter, rate, daysAgo, ...v } of vehicles) {
    const vehicle = await prisma.vehicle.create({
      data: { ...v, orgId: org.id, createdById: admin.id, status: renter ? 'alquilado' : 'disponible' },
    });
    if (!renter) continue;
    const [fullName, docNumber, phone] = renter;
    const r = await prisma.renter.create({ data: { orgId: org.id, fullName, docNumber, phone, createdById: admin.id } });
    await prisma.rental.create({
      data: {
        orgId: org.id, vehicleId: vehicle.id, renterId: r.id, dailyRate: rate,
        startDate: toDbDate(addDays(todayISO(), -daysAgo)), createdById: admin.id,
      },
    });
  }
}

/**
 * Marca el calendario de los contratos activos de ejemplo (si aún no tienen marcas):
 * mayoría pagados, algunos de media cuenta, días sin pago y un día en taller.
 * Ayer y hoy quedan sin marcar para que se vean como "pendientes".
 * Solo toca los vehículos de demo (nunca vehículos registrados a mano).
 */
const DEMO_PLATES = ['ABC123', 'BCF456', 'D4K789', 'EGH321', 'XYZ987', 'MNP654'];

async function demoCalendar(orgName) {
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) return;
  const admin = await prisma.user.findFirst({ where: { orgId: org.id, role: 'admin' } });
  const rentals = await prisma.rental.findMany({ where: { orgId: org.id, status: 'activo', vehicle: { plate: { in: DEMO_PLATES } } } });

  for (const r of rentals) {
    if (await prisma.dailyRecord.count({ where: { vehicleId: r.vehicleId } })) continue;
    const rate = Number(r.dailyRate);
    const start = r.startDate.toISOString().slice(0, 10);
    const lastMarked = addDays(todayISO(), -2);
    let i = 0;
    for (let d = start; d <= lastMarked; d = addDays(d, 1), i++) {
      const status = i === 3 ? 'fuera_servicio' : i % 7 === 6 ? 'no_pago' : i % 9 === 4 ? 'medio' : 'pagado';
      const amount = status === 'pagado' ? rate : status === 'medio' ? rate / 2 : 0;
      await prisma.dailyRecord.create({
        data: {
          orgId: org.id, vehicleId: r.vehicleId, rentalId: r.id,
          date: toDbDate(d), status, amount: String(amount),
          method: amount ? (i % 3 === 0 ? 'yape' : 'efectivo') : null, createdById: admin.id,
        },
      });
    }
    await prisma.expense.createMany({
      data: [
        { orgId: org.id, vehicleId: r.vehicleId, date: toDbDate(addDays(todayISO(), -3)), category: 'servicio', amount: '25', description: 'Lavado y aspirado', createdById: admin.id },
        { orgId: org.id, vehicleId: r.vehicleId, date: toDbDate(addDays(todayISO(), -1)), category: 'accesorio', amount: '45', description: 'Plumillas', createdById: admin.id },
      ],
    });
  }
}

/** PDF mínimo y válido con unas líneas de texto (para documentos de ejemplo). */
function makePdf(lines) {
  const esc = (s) => s.replace(/[()\\]/g, (c) => `\\${c}`);
  const text = lines.map((l, i) => `BT /F1 ${i ? 14 : 22} Tf 60 ${760 - i * 32} Td (${esc(l)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = Buffer.byteLength(pdf); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Documentos de ejemplo con distintos vencimientos (solo vehículos de demo sin documentos). */
async function demoDocuments(orgName, docs) {
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) return;
  const admin = await prisma.user.findFirst({ where: { orgId: org.id, role: 'admin' } });
  for (const { plate, type, label, number, expiresIn } of docs) {
    const vehicle = await prisma.vehicle.findFirst({ where: { orgId: org.id, plate } });
    if (!vehicle || (await prisma.document.count({ where: { vehicleId: vehicle.id, type } }))) continue;
    const expiresOn = addDays(todayISO(), expiresIn);
    const data = makePdf([`${label} - DOCUMENTO DE DEMOSTRACION`, `Placa: ${plate}`, `Numero: ${number}`, `Vence: ${expiresOn}`]);
    await prisma.document.create({
      data: {
        orgId: org.id, vehicleId: vehicle.id, type, number, createdById: admin.id,
        issuedOn: toDbDate(addDays(expiresOn, -365)), expiresOn: toDbDate(expiresOn),
        fileName: `${type}-${plate}.pdf`, mimeType: 'application/pdf', sizeBytes: data.length,
        file: { create: { data, sha256: sha256(data) } },
      },
    });
  }
}

/** Mantenimientos de ejemplo: uno atrasado, uno próximo, otros al día (solo vehículos de demo sin mantenimientos). */
async function demoMaintenances(orgName, vehicles) {
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) return;
  const admin = await prisma.user.findFirst({ where: { orgId: org.id, role: 'admin' } });
  for (const { plate, odometer, services } of vehicles) {
    const vehicle = await prisma.vehicle.findFirst({ where: { orgId: org.id, plate } });
    if (!vehicle || (await prisma.maintenance.count({ where: { vehicleId: vehicle.id } }))) continue;
    if (vehicle.odometer == null) await prisma.vehicle.update({ where: { id: vehicle.id }, data: { odometer } });
    for (const { daysAgo, nextInDays, ...m } of services) {
      await prisma.maintenance.create({
        data: {
          ...m, orgId: org.id, vehicleId: vehicle.id, createdById: admin.id,
          doneOn: toDbDate(addDays(todayISO(), -daysAgo)),
          nextDate: nextInDays == null ? null : toDbDate(addDays(todayISO(), nextInDays)),
        },
      });
    }
  }
}

try {
  const superadmin = await prisma.user.findFirst({ where: { role: 'superadmin' }, orderBy: { createdAt: 'asc' } });

  await business('Autos Lima Norte',
    { username: 'admin1', email: 'admin1@demo.local', name: 'Carlos Ramírez' },
    { username: 'operador1', name: 'Lucía Torres' }, superadmin?.id);
  await business('Movilidad Sur',
    { username: 'admin2', email: 'admin2@demo.local', name: 'María Quispe' },
    { username: 'operador2', name: 'Jorge Huamán' }, superadmin?.id);

  await demoFleet('Autos Lima Norte', 'admin1', [
    { plate: 'ABC123', brand: 'Toyota', model: 'Yaris', year: 2019, color: 'Blanco', renter: ['Juan Pérez Soto', '45871236', '987654321'], rate: '80', daysAgo: 12 },
    { plate: 'BCF456', brand: 'Hyundai', model: 'Accent', year: 2020, color: 'Plata', renter: ['Rosa Mamani Quispe', '70125489', '956321478'], rate: '75', daysAgo: 5 },
    { plate: 'D4K789', brand: 'Kia', model: 'Rio', year: 2021, color: 'Rojo', renter: ['Pedro Alvarado', '41236587', '912345678'], rate: '90', daysAgo: 30 },
    { plate: 'EGH321', brand: 'Nissan', model: 'Versa', year: 2018, color: 'Negro' },
  ]);
  await demoFleet('Movilidad Sur', 'admin2', [
    { plate: 'XYZ987', brand: 'Chevrolet', model: 'Sail', year: 2017, color: 'Gris', renter: ['Luis Condori', '43215678', '998877665'], rate: '70', daysAgo: 8 },
    { plate: 'MNP654', brand: 'Suzuki', model: 'Swift', year: 2022, color: 'Azul' },
  ]);

  await demoCalendar('Autos Lima Norte');
  await demoCalendar('Movilidad Sur');
  await demoDocuments('Autos Lima Norte', [
    { plate: 'ABC123', type: 'soat', label: 'SOAT', number: 'SOAT-2026-004512', expiresIn: 12 },
    { plate: 'D4K789', type: 'revision_tecnica', label: 'REVISION TECNICA', number: 'RT-88123', expiresIn: -5 },
    { plate: 'BCF456', type: 'soat', label: 'SOAT', number: 'SOAT-2026-007788', expiresIn: 200 },
  ]);
  await demoDocuments('Movilidad Sur', [
    { plate: 'XYZ987', type: 'soat', label: 'SOAT', number: 'SOAT-2026-001234', expiresIn: 25 },
  ]);

  await demoMaintenances('Autos Lima Norte', [
    { plate: 'ABC123', odometer: 65400, services: [
      { daysAgo: 150, type: 'Cambio de aceite', km: 56000, partsCost: '80', laborCost: '30', cost: '110', workshop: 'Lubricentro El Rápido', nextKm: 61000 },
      { daysAgo: 40, type: 'Cambio de aceite', km: 61200, partsCost: '90', laborCost: '30', cost: '120', workshop: 'Lubricentro El Rápido', detail: 'Aceite 10W-30 + filtro', nextKm: 66000 },
    ] },
    { plate: 'D4K789', odometer: 88200, services: [
      { daysAgo: 190, type: 'Frenos', km: 79000, partsCost: '180', laborCost: '80', cost: '260', workshop: 'Frenos Perú', detail: 'Pastillas delanteras', nextInDays: -10 },
      { daysAgo: 25, type: 'Llantas', km: 87500, partsCost: '600', laborCost: '40', cost: '640', workshop: 'Llantas Norte', nextInDays: 340 },
    ] },
    { plate: 'BCF456', odometer: 31000, services: [
      { daysAgo: 12, type: 'Revisión general', km: 30800, partsCost: '60', laborCost: '120', cost: '180', workshop: 'Taller Don Pepe', nextKm: 40800, nextInDays: 170 },
    ] },
  ]);
  await demoMaintenances('Movilidad Sur', [
    { plate: 'XYZ987', odometer: 102300, services: [
      { daysAgo: 60, type: 'Cambio de aceite', km: 97800, partsCost: '70', laborCost: '25', cost: '95', nextKm: 102800, nextInDays: 30 },
    ] },
  ]);

  console.log(`\n✔ Datos de demo listos (contraseña: ${PASSWORD})`);
  console.log('  Negocio 1 "Autos Lima Norte":  admin1  /  operador1');
  console.log('  Negocio 2 "Movilidad Sur":     admin2  /  operador2');
  if (!superadmin) console.log('  (No hay superadmin: créalo con npm run superadmin)');
  console.log('');
} finally {
  await prisma.$disconnect();
}
