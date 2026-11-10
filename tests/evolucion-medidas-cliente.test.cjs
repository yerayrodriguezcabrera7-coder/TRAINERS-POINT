const { test } = require('node:test');
const assert = require('node:assert/strict');

const metrics = [
  ["weight", "Peso", "kg"],
  ["hip", "Cadera", "cm"],
  ["waist", "Cintura", "cm"],
  ["leg", "Pierna", "cm"],
  ["chest", "Pecho", "cm"],
  ["arm", "Brazo", "cm"],
];

const metricSuffixes = {
  weight: "de peso",
  waist: "de cintura",
  hip: "de cadera",
  leg: "de pierna",
  chest: "de pecho",
  arm: "de brazo",
};

function metricMeasurements(measurements, key) {
  return measurements.filter((m) => m[key] !== null && m[key] !== undefined && m[key] !== "");
}

function getGlobalEvolution(measurements) {
  if (!measurements || measurements.length < 2) return null;

  const order = ["weight", "waist", "hip", "leg", "chest", "arm"];
  const metricMap = new Map(metrics.map(([key, label, unit]) => [key, { label, unit, suffix: metricSuffixes[key] || `de ${label.toLowerCase()}` }]));

  const diffItems = [];
  let earliestDate = null;
  let latestDate = null;

  for (const key of order) {
    const info = metricMap.get(key);
    if (!info) continue;
    const values = metricMeasurements(measurements, key);
    if (values.length < 2) continue;

    const first = values[0];
    const latest = values.at(-1);

    if (!earliestDate || new Date(first.measuredAt) < new Date(earliestDate)) {
      earliestDate = first.measuredAt;
    }
    if (!latestDate || new Date(latest.measuredAt) > new Date(latestDate)) {
      latestDate = latest.measuredAt;
    }

    const firstVal = Number(first[key]);
    const latestVal = Number(latest[key]);
    const diff = Math.round((latestVal - firstVal) * 100) / 100;
    const diffFormatted = `${diff > 0 ? "+" : ""}${diff.toLocaleString("es-ES", { maximumFractionDigits: 1 })} ${info.unit}`;

    diffItems.push({
      key,
      label: info.label,
      unit: info.unit,
      suffix: info.suffix,
      firstVal,
      latestVal,
      diff,
      diffFormatted,
      summaryFragment: `${diffFormatted} ${info.suffix}`,
    });
  }

  if (diffItems.length === 0) return null;

  const elapsedDays = (earliestDate && latestDate) ? Math.max(0, Math.round(
    (Date.parse(`${latestDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${earliestDate.slice(0, 10)}T00:00:00Z`)) / 86400000,
  )) : 0;

  const summaryPhrase = `Desde su inicio: ${diffItems.map(d => d.summaryFragment).join(" | ")}`;

  return {
    diffItems,
    summaryPhrase,
    earliestDate,
    latestDate,
    elapsedDays,
  };
}

test('getGlobalEvolution: retorna null si hay menos de 2 mediciones', () => {
  assert.equal(getGlobalEvolution([]), null);
  assert.equal(getGlobalEvolution(null), null);
  assert.equal(getGlobalEvolution([
    { id: '1', measuredAt: '2026-01-10T10:00:00Z', weight: 80, waist: 90 }
  ]), null);
});

test('getGlobalEvolution: calcula exactamente "-4,2 kg de peso | -5 cm de cintura"', () => {
  const measurements = [
    {
      id: 'm1',
      measuredAt: '2026-01-10T10:00:00Z',
      weight: 82.0,
      waist: 90.0,
      hip: null,
    },
    {
      id: 'm2',
      measuredAt: '2026-02-25T10:00:00Z',
      weight: 77.8, // 77.8 - 82.0 = -4.2 kg
      waist: 85.0, // 85.0 - 90.0 = -5 cm
      hip: null,
    },
  ];

  const evo = getGlobalEvolution(measurements);
  assert.ok(evo);
  assert.equal(evo.diffItems.length, 2);
  assert.equal(evo.summaryPhrase, 'Desde su inicio: -4,2 kg de peso | -5 cm de cintura');
  assert.equal(evo.elapsedDays, 46);

  // Detalle por métrica
  assert.equal(evo.diffItems[0].key, 'weight');
  assert.equal(evo.diffItems[0].diff, -4.2);
  assert.equal(evo.diffItems[0].firstVal, 82.0);
  assert.equal(evo.diffItems[0].latestVal, 77.8);

  assert.equal(evo.diffItems[1].key, 'waist');
  assert.equal(evo.diffItems[1].diff, -5);
  assert.equal(evo.diffItems[1].firstVal, 90.0);
  assert.equal(evo.diffItems[1].latestVal, 85.0);
});

test('getGlobalEvolution: maneja ganancias musculares o aumentos con "+"', () => {
  const measurements = [
    {
      id: 'm1',
      measuredAt: '2026-01-01T10:00:00Z',
      weight: 70.0,
      arm: 32.0,
    },
    {
      id: 'm2',
      measuredAt: '2026-03-01T10:00:00Z',
      weight: 72.5, // +2.5 kg
      arm: 34.0,   // +2 cm
    },
  ];

  const evo = getGlobalEvolution(measurements);
  assert.ok(evo);
  assert.equal(evo.summaryPhrase, 'Desde su inicio: +2,5 kg de peso | +2 cm de brazo');
});

test('getGlobalEvolution: maneja registros intermedios y mediciones parciales', () => {
  const measurements = [
    { id: 'm1', measuredAt: '2026-01-01T10:00:00Z', weight: 80.0, waist: 95.0, hip: 105.0 },
    { id: 'm2', measuredAt: '2026-01-15T10:00:00Z', weight: 79.0, waist: null, hip: null },
    { id: 'm3', measuredAt: '2026-02-01T10:00:00Z', weight: 78.0, waist: 91.0, hip: 102.0 },
  ];

  const evo = getGlobalEvolution(measurements);
  assert.ok(evo);
  assert.equal(evo.diffItems.length, 3);
  assert.equal(evo.summaryPhrase, 'Desde su inicio: -2 kg de peso | -4 cm de cintura | -3 cm de cadera');
});

test('Formato de cabecera con resumen compacto si hay más de 3 métricas', () => {
  const diffItems = [
    { summaryFragment: '-4,2 kg de peso' },
    { summaryFragment: '-5 cm de cintura' },
    { summaryFragment: '-3 cm de cadera' },
    { summaryFragment: '+1,5 cm de brazo' },
  ];

  const headerText = diffItems.length <= 3
    ? `Desde su inicio: ${diffItems.map(d => d.summaryFragment).join(" | ")}`
    : `Desde su inicio: ${diffItems.slice(0, 3).map(d => d.summaryFragment).join(" | ")} (+${diffItems.length - 3} más)`;

  assert.equal(headerText, 'Desde su inicio: -4,2 kg de peso | -5 cm de cintura | -3 cm de cadera (+1 más)');
});
