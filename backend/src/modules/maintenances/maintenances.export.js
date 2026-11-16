// Excel (.xlsx) del registro de mantenimientos, con el formato del cuadro del cliente:
//   Hoja 1 "Mantenimientos": N°, Fecha, Vehículo/Modelo, Kilometraje, Tipo de servicio, Detalle,
//                            Taller, Repuestos, Mano de obra, Total, Próximo mantenimiento.
//   Hoja 2 "Gastos por mes": por mes y placa → mantenimiento + otros gastos = total.
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { fromDbDate, todayISO } from '../../lib/dates.js';
import { fromCents, toCents } from '../../lib/money.js';
import { list } from './maintenances.service.js';

const NAVY = 'FF1F3A5F';
const LIGHT = 'FFDCE8F5';
const MONEY = '"S/" #,##0.00';
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const plate = (p) => (p.length === 6 ? `${p.slice(0, 3)}-${p.slice(3)}` : p);
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const num = (v) => Number(v);
const dmy = (iso) => iso.split('-').reverse().join('/');
const kmText = (n) => `${new Intl.NumberFormat('es-PE').format(n)} km`;
const monthName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const thin = { style: 'thin', color: { argb: 'FFBFC9D6' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

/** Título + subtítulo + encabezados con el estilo del cuadro. */
function frame(ws, title, subtitle, headers) {
  const last = String.fromCharCode(64 + headers.length);
  ws.mergeCells(`A1:${last}1`);
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${last}2`);
  ws.getCell('A2').value = subtitle;
  ws.getCell('A2').font = { italic: true, size: 10 };
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };

  const head = ws.getRow(4);
  head.values = headers;
  head.height = 32;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BORDER;
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
}

function styleBody(row, moneyCols) {
  row.eachCell({ includeEmpty: true }, (c, col) => {
    c.border = BORDER;
    c.alignment = { vertical: 'top', wrapText: true };
    if (moneyCols.includes(col)) c.numFmt = MONEY;
  });
}

function totalRow(ws, label, labelSpan, sums, moneyCols) {
  const row = ws.addRow([]);
  row.getCell(1).value = label;
  if (labelSpan > 1) ws.mergeCells(row.number, 1, row.number, labelSpan);
  for (const [col, value] of Object.entries(sums)) row.getCell(Number(col)).value = value;
  row.eachCell({ includeEmpty: true }, (c, col) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    c.border = BORDER;
    if (moneyCols.includes(col)) c.numFmt = MONEY;
  });
  return row;
}

/**
 * @returns {Promise<{ buffer: Buffer, fileName: string }>}
 */
export async function exportXlsx(ctx, { vehicleId } = {}) {
  let vehicle = null;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, orgId: ctx.orgId }, select: { plate: true, brand: true, model: true } });
    if (!vehicle) throw notFound('Vehículo no encontrado');
  }
  const [items, expenses] = await Promise.all([
    list(ctx, { vehicleId }),
    prisma.expense.findMany({
      where: { orgId: ctx.orgId, vehicleId },
      select: { vehicleId: true, date: true, amount: true, vehicle: { select: { plate: true } } },
    }),
  ]);
  const rows = [...items].reverse(); // del más antiguo al más reciente (N° correlativo)
  const today = todayISO();
  const scope = vehicle ? `${plate(vehicle.plate)} · ${vehicle.brand} ${vehicle.model}` : 'Todos los vehículos';
  const subtitle = `${ctx.org?.name ?? ''} · ${scope} · Generado el ${dmy(today)}. Una fila por cada mantenimiento, reparación o servicio realizado.`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AUTO-CONTROL';
  wb.created = new Date();

  // ───── Hoja 1: registro ─────
  const ws = wb.addWorksheet('Mantenimientos', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [
    { width: 5 }, { width: 11 }, { width: 24 }, { width: 12 }, { width: 22 }, { width: 38 },
    { width: 22 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 26 },
  ];
  frame(ws, 'REGISTRO DE MANTENIMIENTOS – FLOTA VEHICULAR', subtitle, [
    'N°', 'Fecha', 'Vehículo / Modelo', 'Kilometraje', 'Tipo de servicio', 'Detalle de reparación / servicio',
    'Taller', 'Repuestos (S/)', 'Mano de obra (S/)', 'Total (S/)', 'Próximo mantenimiento (km o fecha)',
  ]);
  const MONEY_COLS = [8, 9, 10];
  let parts = 0;
  let labor = 0;
  let total = 0;
  rows.forEach((m, i) => {
    const next = [m.nextKm != null && kmText(m.nextKm), m.nextDate && dmy(m.nextDate)].filter(Boolean).join(' o ');
    const row = ws.addRow([
      i + 1, asDate(m.doneOn), `${plate(m.vehicle.plate)} · ${m.vehicle.brand} ${m.vehicle.model}`, m.km ?? '',
      m.type, m.detail ?? '', m.workshop ?? '', num(m.partsCost), num(m.laborCost), num(m.cost),
      m.superseded && next ? `${next} (ya se hizo)` : next,
    ]);
    styleBody(row, MONEY_COLS);
    row.getCell(2).numFmt = 'dd/mm/yyyy';
    row.getCell(4).numFmt = '#,##0';
    parts += toCents(m.partsCost);
    labor += toCents(m.laborCost);
    total += toCents(m.cost);
  });
  if (!rows.length) ws.addRow(['', 'Sin mantenimientos registrados']);
  else totalRow(ws, 'TOTAL', 7, { 8: num(fromCents(parts)), 9: num(fromCents(labor)), 10: num(fromCents(total)) }, MONEY_COLS);

  // ───── Hoja 2: gastos mensuales por vehículo ─────
  const ws2 = wb.addWorksheet('Gastos por mes');
  ws2.columns = [{ width: 18 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 16 }];
  frame(ws2, 'GASTOS MENSUALES POR VEHÍCULO', `${ctx.org?.name ?? ''} · ${scope} · Mantenimiento + otros gastos del calendario de cobros.`,
    ['Mes', 'Placa', 'Mantenimiento (S/)', 'Otros gastos (S/)', 'Total (S/)']);

  const byKey = new Map(); // `${mes}|${placa}` → céntimos
  const add = (month, p, key, amount) => {
    const k = `${month}|${p}`;
    if (!byKey.has(k)) byKey.set(k, { month, plate: p, maintenance: 0, other: 0 });
    byKey.get(k)[key] += toCents(String(amount));
  };
  for (const m of items) add(m.doneOn.slice(0, 7), m.vehicle.plate, 'maintenance', m.cost);
  for (const e of expenses) add(fromDbDate(e.date).slice(0, 7), e.vehicle.plate, 'other', e.amount.toString());

  const lines = [...byKey.values()].sort((a, b) => b.month.localeCompare(a.month) || a.plate.localeCompare(b.plate));
  const M2 = [3, 4, 5];
  let month = null;
  let acc = { maintenance: 0, other: 0 };
  const flush = () => {
    if (month === null) return;
    totalRow(ws2, `Total ${monthName(month)}`, 2, {
      3: num(fromCents(acc.maintenance)), 4: num(fromCents(acc.other)), 5: num(fromCents(acc.maintenance + acc.other)),
    }, M2);
  };
  for (const l of lines) {
    if (l.month !== month) {
      flush();
      month = l.month;
      acc = { maintenance: 0, other: 0 };
    }
    const row = ws2.addRow([monthName(l.month), plate(l.plate), num(fromCents(l.maintenance)), num(fromCents(l.other)), num(fromCents(l.maintenance + l.other))]);
    styleBody(row, M2);
    acc.maintenance += l.maintenance;
    acc.other += l.other;
  }
  flush();
  if (!lines.length) ws2.addRow(['Sin gastos registrados']);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const fileName = `mantenimientos-${vehicle ? `${vehicle.plate}-` : ''}${today}.xlsx`;
  return { buffer, fileName };
}
