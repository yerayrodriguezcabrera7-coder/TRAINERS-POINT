const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Página de fichajes tiene la estructura y clases del diseño de clientes', () => {
  const html = fs.readFileSync('web/fichajes.html', 'utf8');

  // Links CSS
  assert.ok(html.includes('href="/clients.css"'), 'Debe incluir clients.css');
  assert.ok(html.includes('href="/menu.css"'), 'Debe incluir menu.css');

  // Estructura general de Clients
  assert.ok(html.includes('class="app-shell"'), 'Debe tener app-shell');
  assert.ok(html.includes('data-app-menu'), 'Debe tener el menú de la app');
  assert.ok(html.includes('class="main-content"'), 'Debe tener main-content');
  assert.ok(html.includes('class="topbar"'), 'Debe tener topbar');
  assert.ok(html.includes('class="breadcrumb"'), 'Debe tener breadcrumb');
  assert.ok(html.includes('class="profile-avatar"'), 'Debe tener profile-avatar');
  assert.ok(html.includes('class="page-content"'), 'Debe tener page-content');
  assert.ok(html.includes('class="page-heading"'), 'Debe tener page-heading');
  assert.ok(html.includes('class="page-heading-logo"'), 'Debe tener page-heading-logo');
  assert.ok(html.includes('class="eyebrow"'), 'Debe tener eyebrow');

  // Stats Grid con estilo clients.css
  assert.ok(html.includes('class="stats-grid"'), 'Debe tener stats-grid');
  assert.ok(html.includes('stat-card stat-card-primary'), 'Debe tener stat-card-primary');
  assert.ok(html.includes('stat-label'), 'Debe tener stat-label');
  assert.ok(html.includes('stat-value'), 'Debe tener stat-value');
  assert.ok(html.includes('stat-foot'), 'Debe tener stat-foot');

  // Panel principal
  assert.ok(html.includes('class="client-panel"'), 'Debe tener client-panel');
  assert.ok(html.includes('class="panel-heading"'), 'Debe tener panel-heading');
  assert.ok(html.includes('class="client-filter-chips"'), 'Debe tener client-filter-chips');
  assert.ok(html.includes('class="filter-chip"'), 'Debe tener filter-chip');
  assert.ok(html.includes('class="toolbar"'), 'Debe tener toolbar');
  assert.ok(html.includes('class="search-box"'), 'Debe tener search-box');

  // Contenedor de lista compatible
  assert.ok(html.includes('id="employee-list"'), 'Debe conservar id="employee-list" para compatibilidad');
  assert.ok(html.includes('class="table-footer"'), 'Debe tener table-footer');
  assert.ok(html.includes('id="toast"'), 'Debe tener contenedor de toast');
});

