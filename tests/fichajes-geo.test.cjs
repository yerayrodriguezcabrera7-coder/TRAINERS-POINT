const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../dist/calendar/store');
const { haversineDistanceMeters } = require('../dist/calendar/model');

test('Cálculo de geodistancia Haversine', () => {
  // Centro Bilbao: 43.2630, -2.9350
  const lat1 = 43.2630;
  const lon1 = -2.9350;

  // Mismo punto
  assert.equal(haversineDistanceMeters(lat1, lon1, lat1, lon1), 0);

  // Punto a ~100 metros hacia el norte (cada 0.0009 grados de latitud son aprox 100m)
  const lat2 = 43.2639;
  const d1 = haversineDistanceMeters(lat1, lon1, lat2, lon1);
  assert.ok(d1 >= 90 && d1 <= 110, `Distancia esperada ~100m, obtenida: ${d1}m`);

  // Punto a ~3.5 km
  const lat3 = 43.2900;
  const lon3 = -2.9500;
  const d2 = haversineDistanceMeters(lat1, lon1, lat3, lon3);
  assert.ok(d2 > 3000 && d2 < 4000, `Distancia esperada ~3.5km, obtenida: ${d2}m`);
});

test('Geolocalización en fichajes: en centro vs fuera de centro', async () => {
  const centerLat = 43.2630;
  const centerLon = -2.9350;

  let storedRecords = [];
  let openShift = null;

  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('FROM calendar.shared_staff')) return {rows:[{data:{id:'e1',name:'Entrenador Uno',active:true}}]};
      if (sql.includes('SELECT config FROM calendar.gyms')) {
        return {
          rows: [{
            config: {
              location: {
                latitude: centerLat,
                longitude: centerLon,
                radiusMeters: 200,
                address: 'Trainers Point Bizkaia',
              },
              employees: [{ id: 'e1', name: 'Entrenador Uno', active: true }],
            },
          }],
        };
      }
      if (sql.includes('SELECT id,employee_id') && sql.includes('FOR UPDATE')) {
        return { rows: openShift ? [openShift] : [] };
      }
      if (sql.includes('INSERT INTO calendar.attendance')) {
        const geoRecord = params[3] ? JSON.parse(params[3]) : null;
        openShift = {
          id: params[0],
          employeeId: params[2],
          clockIn: new Date().toISOString(),
          clockOut: null,
          geoIn: geoRecord,
          geoOut: null,
        };
        storedRecords.push(openShift);
        return { rows: [openShift] };
      }
      if (sql.includes('UPDATE calendar.attendance SET clock_out')) {
        const geoRecord = params[1] ? JSON.parse(params[1]) : null;
        openShift.clockOut = new Date().toISOString();
        openShift.geoOut = geoRecord;
        const res = { ...openShift };
        openShift = null;
        return { rows: [res] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  const mockPool = {
    connect: async () => mockClient,
    query: async () => ({ rows: [] }),
  };

  const store = new Store(mockPool);

  // Caso 1: Entrada dentro del centro (a 30 metros del centro)
  const inRes = await store.clock('gym-1', {
    employeeId: 'e1',
    action: 'IN',
    geo: {
      latitude: 43.2632,
      longitude: -2.9351,
      accuracy: 15,
    },
  });

  assert.ok(inRes.geoIn, 'Debe haber registrado geoIn');
  assert.equal(inRes.geoIn.inGeofence, true, 'Debe estar dentro del radio del centro');
  assert.ok(inRes.geoIn.distanceMeters < 200, `Distancia debe ser <200m: ${inRes.geoIn.distanceMeters}m`);
  assert.equal(inRes.geoIn.accuracy, 15);

  // Caso 2: Salida fuera del centro (a 2.5 km)
  const outRes = await store.clock('gym-1', {
    employeeId: 'e1',
    action: 'OUT',
    geo: {
      latitude: 43.2800,
      longitude: -2.9500,
      accuracy: 20,
    },
  });

  assert.ok(outRes.geoOut, 'Debe haber registrado geoOut');
  assert.equal(outRes.geoOut.inGeofence, false, 'Debe estar fuera de la geocerca');
  assert.ok(outRes.geoOut.distanceMeters > 500, `Distancia debe ser >500m: ${outRes.geoOut.distanceMeters}m`);

  // Caso 3: Fichaje sin GPS (legalmente permitido para no bloquear el registro de jornada)
  const inNoGps = await store.clock('gym-1', {
    employeeId: 'e1',
    action: 'IN',
  });
  assert.equal(inNoGps.geoIn, null, 'Fichaje sin GPS es válido y se registra correctamente');
});

