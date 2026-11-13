const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('Calendario: Día y Semana pintan una sola copia con el color real del servicio', () => {
  const source = fs.readFileSync('web/calendar/app.js', 'utf8');
  assert.equal((source.match(/C\.layoutEvents\(dayColBookings\)/g) || []).length, 1);
  assert.match(source, /const color = lookup\('services', b\.serviceId\)\.color \|\| '#317b9b'/);
  assert.match(source, /--event-bg:\$\{color\};--event-border:\$\{color\};--event-ink:\$\{colorInk\(color\)\}/);
  assert.match(source, /month-event[\s\S]*--event-bg:\$\{color\}/);
});

test('Negocio: las tres pantallas están habilitadas, estructuradas y disponibles en permisos', () => {
  const pages = [
    ['web/business/dashboard.html', 'Cuadro de mando'],
    ['web/business/reports.html', 'Informes'],
    ['web/business/audit.html', 'Historial de eventos'],
  ];
  for (const [file, title] of pages) {
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
    try {
      assert.ok(dom.window.document.querySelector('aside[data-app-menu]'), file);
      assert.ok(dom.window.document.querySelector('main.main-content .page-content'), file);
      assert.match(dom.window.document.title, new RegExp(title, 'i'));
    } finally { dom.window.close(); }
  }
  const menu = fs.readFileSync('web/shared/menu.js', 'utf8');
  assert.match(menu, /Cuadro de mando','chart','\/cuadro-mando\.html/);
  assert.match(menu, /Informes','report','\/informes\.html/);
  assert.match(menu, /Historial de eventos','history','\/historial-eventos\.html/);
  const permissions = fs.readFileSync('web/admin/permisos-pagina.js', 'utf8');
  for (const key of ['cuadro-mando.html', 'informes.html', 'historial-eventos.html']) assert.ok(permissions.includes(key));
});

test('CSV: evita fórmulas de hoja de cálculo y conserva cabeceras limpias', () => {
  const { reportCsv } = require('../dist/routes/business');
  const csv = reportCsv({ columns: ['Cliente', 'Importe'], rows: [['=2+2', 10]], type: 'debts', title: '', range: { from: '', to: '' }, generatedAt: '' });
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=2\+2"/);
  assert.match(csv, /"Cliente";"Importe"/);
});
