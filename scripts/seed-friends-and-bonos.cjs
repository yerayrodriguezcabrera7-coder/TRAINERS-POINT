const fs = require('fs');
const { randomUUID } = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');

const prisma = new PrismaClient();
const creds = JSON.parse(fs.readFileSync('.calendar-dev/credentials.json'));
const pool = new Pool({
  connectionString: `postgresql://postgres:${encodeURIComponent(creds.password)}@127.0.0.1:55439/postgres?schema=public&sslmode=disable`
});

async function main() {
  console.log('--- Iniciando creación de clientes con amigos, bonos y citas ---');

  // 1. Gimnasio activo de Trainers Point
  const gym = await prisma.gym.findFirst({
    where: { isActive: true, brand: 'TRAINERS_POINT' }
  }) || (await prisma.gym.findFirst({ where: { isActive: true } }));

  if (!gym) throw new Error('No se encontró ningún gimnasio activo.');
  console.log(`Gimnasio seleccionado: ${gym.name} (${gym.id})`);

  // 2. Servicios
  const sInd = await prisma.service.findFirst({ where: { modality: 'INDIVIDUAL', isActive: true } });
  const sDual = await prisma.service.findFirst({ where: { modality: 'DUAL', isActive: true } }) || sInd;
  console.log(`Servicio Individual: ${sInd?.name} (${sInd?.id})`);
  console.log(`Servicio Dual: ${sDual?.name} (${sDual?.id})`);

  // 3. Entrenador (Yeray)
  const trainerId = '1f962355-4260-4111-be31-eac57c49fc2b';
  const trainerName = 'Yeray';
  await prisma.employee.upsert({
    where: { id: trainerId },
    update: { jobTitle: 'Entrenador Personal', status: 'ACTIVO' },
    create: {
      id: trainerId,
      jobTitle: 'Entrenador Personal',
      status: 'ACTIVO'
    }
  });
  console.log(`Entrenador verificado: ${trainerName} (${trainerId})`);

  // 4. Limpiar datos de prueba previos si existen (con emails .test)
  const existingTestClients = await prisma.client.findMany({
    where: { email: { endsWith: '@trainerspoint.test' } }
  });
  if (existingTestClients.length) {
    const ids = existingTestClients.map(c => c.id);
    await pool.query('DELETE FROM calendar.bookings WHERE data->>\'clientId\' = ANY($1)', [ids]);
    await pool.query('DELETE FROM calendar.recoveries WHERE data->>\'clientId\' = ANY($1)', [ids]);
    await prisma.clientMeasurement.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.clientNote.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.clientServicePackage.deleteMany({ where: { clientId: { in: ids } } });
    // Romper referencias circulares
    await prisma.client.updateMany({ where: { id: { in: ids } }, data: { referredById: null } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
    console.log(`Limpiados ${existingTestClients.length} clientes de prueba anteriores.`);
  }

  // 5. Crear clientes con red de amigos
  console.log('Creando grupo de amigos 1: Marcos Delgado, David Navarro y Lucía Méndez...');
  
  // Amigo 1: Marcos Delgado
  const marcos = await prisma.client.create({
    data: {
      firstName: 'Marcos',
      lastName: 'Delgado Santos',
      email: 'marcos.delgado@trainerspoint.test',
      phone: '611223344',
      dni: '12345678A',
      address: 'Calle Iparraguirre 12, Bilbao',
      birthDate: new Date('1994-05-14'),
      status: 'ACTIVO',
      brand: 'TRAINERS_POINT',
      gymId: gym.id,
      assignedWorkerId: null,
      sex: 'HOMBRE',
      source: 'PASO_POR_LA_PUERTA',
      availability: { days: ['M', 'J'], slots: ['TARDE'] },
      contactSlot: 'TARDE',
      objective: 'Fuerza e hipertrofia. Entrena siempre con su mejor amigo David en sesión dual.',
      notes: 'Cliente muy constante. Le gusta el entrenamiento de fuerza pesado y trabajo funcional.'
    }
  });

  // Amigo 2: David Navarro (Recomendado por Marcos)
  const david = await prisma.client.create({
    data: {
      firstName: 'David',
      lastName: 'Navarro Ibáñez',
      email: 'david.navarro@trainerspoint.test',
      phone: '622334455',
      dni: '23456789B',
      address: 'Alameda Urquijo 45, Bilbao',
      birthDate: new Date('1993-11-20'),
      status: 'ACTIVO',
      brand: 'TRAINERS_POINT',
      gymId: gym.id,
      assignedWorkerId: null,
      sex: 'HOMBRE',
      source: 'RECOMENDACION',
      sourceDetail: 'Amigo de Marcos Delgado',
      availability: { days: ['M', 'J'], slots: ['TARDE'] },
      contactSlot: 'TARDE',
      referredById: marcos.id,
      objective: 'Preparación física y fuerza. Comparte bono dual con Marcos.',
      notes: 'Amigo íntimo de Marcos Delgado. Vienen juntos en coche desde Indautxu.'
    }
  });

  // Amiga 3: Lucía Méndez (Amiga del grupo de Marcos y David)
  const lucia = await prisma.client.create({
    data: {
      firstName: 'Lucía',
      lastName: 'Méndez Peña',
      email: 'lucia.mendez@trainerspoint.test',
      phone: '633445566',
      dni: '34567890C',
      address: 'Calle Colón de Larreátegui 8, Bilbao',
      birthDate: new Date('1996-03-08'),
      status: 'ACTIVO',
      brand: 'TRAINERS_POINT',
      gymId: gym.id,
      assignedWorkerId: null,
      sex: 'MUJER',
      source: 'RECOMENDACION',
      sourceDetail: 'Recomendada por Marcos y David',
      availability: { days: ['L', 'M', 'X', 'J', 'V'], slots: ['MANANA'] },
      contactSlot: 'MANANA',
      referredById: marcos.id,
      objective: 'Readaptación tras lesión de rodilla y tonificación general.',
      notes: 'Amiga de Marcos y David. Quiere entrenar en días alternos.'
    }
  });

  console.log('Creando grupo de amigas 2: Sofía Ramos y Elena Morales...');

  // Amiga 4: Sofía Ramos
  const sofia = await prisma.client.create({
    data: {
      firstName: 'Sofía',
      lastName: 'Ramos Castillo',
      email: 'sofia.ramos@trainerspoint.test',
      phone: '644556677',
      dni: '45678901D',
      address: 'Gran Vía 56, Bilbao',
      birthDate: new Date('1991-09-25'),
      status: 'ACTIVO',
      brand: 'TRAINERS_POINT',
      gymId: gym.id,
      assignedWorkerId: null,
      sex: 'MUJER',
      source: 'INSTAGRAM',
      availability: { days: ['L', 'X'], slots: ['MANANA'] },
      contactSlot: 'MANANA',
      objective: 'Pérdida de grasa, salud cardiovascular y movilidad.',
      notes: 'Muy activa, suele traer a su amiga Elena Morales a entrenar.'
    }
  });

  // Amiga 5: Elena Morales (Recomendada por Sofía)
  const elena = await prisma.client.create({
    data: {
      firstName: 'Elena',
      lastName: 'Morales Vidal',
      email: 'elena.morales@trainerspoint.test',
      phone: '655667788',
      dni: '56789012E',
      address: 'Calle Henao 21, Bilbao',
      birthDate: new Date('1992-02-17'),
      status: 'ACTIVO',
      brand: 'TRAINERS_POINT',
      gymId: gym.id,
      assignedWorkerId: null,
      sex: 'MUJER',
      source: 'RECOMENDACION',
      sourceDetail: 'Amiga de Sofía Ramos',
      availability: { days: ['L', 'V'], slots: ['TARDE'] },
      contactSlot: 'TARDE',
      referredById: sofia.id,
      objective: 'Acondicionamiento físico general y mejora postural.',
      notes: 'Amiga y compañera de oficina de Sofía Ramos.'
    }
  });

  // Amigo 6: Alejandro Ortiz (Recomendado por David Navarro, bono urgente)
  const alejandro = await prisma.client.create({
    data: {
      firstName: 'Alejandro',
      lastName: 'Ortiz Ruiz',
      email: 'alejandro.ortiz@trainerspoint.test',
      phone: '666778899',
      dni: '67890123F',
      address: 'Calle Pozas 33, Bilbao',
      birthDate: new Date('1995-07-30'),
      status: 'ACTIVO',
      brand: 'TRAINERS_POINT',
      gymId: gym.id,
      assignedWorkerId: null,
      sex: 'HOMBRE',
      source: 'RECOMENDACION',
      sourceDetail: 'Amigo de David Navarro',
      availability: { days: ['L', 'X', 'V'], slots: ['MANANA'] },
      contactSlot: 'MANANA',
      referredById: david.id,
      objective: 'Rendimiento deportivo para fútbol aficionado.',
      notes: 'Amigo de David Navarro del equipo de fútbol sala.'
    }
  });

  // 6. Mediciones corporales para enriquecer fichas
  await prisma.clientMeasurement.createMany({
    data: [
      { clientId: marcos.id, measuredAt: new Date(Date.now() - 30 * 86400000), weight: 80.2, bodyFat: 15.5, waist: 84.0, chest: 104.0, notes: 'Medición inicial.' },
      { clientId: marcos.id, measuredAt: new Date(), weight: 78.5, bodyFat: 14.2, waist: 81.5, chest: 106.0, notes: 'Control mensual: aumento masa muscular y pérdida de grasa.' },
      { clientId: david.id, measuredAt: new Date(Date.now() - 20 * 86400000), weight: 83.5, bodyFat: 17.2, waist: 88.0, chest: 102.0, notes: 'Inicio de temporada.' },
      { clientId: david.id, measuredAt: new Date(), weight: 82.0, bodyFat: 16.5, waist: 86.0, chest: 103.5, notes: 'Progreso constante en tren superior.' },
      { clientId: lucia.id, measuredAt: new Date(), weight: 61.4, bodyFat: 22.0, waist: 68.0, leg: 54.0, notes: 'Evaluación funcional inicial.' }
    ]
  });

  // 7. Notas en las fichas
  await prisma.clientNote.createMany({
    data: [
      { clientId: marcos.id, category: 'SEGUIMIENTO', content: 'Evolución impecable en sentadilla y peso muerto. Gran química entrenando con David.' },
      { clientId: david.id, category: 'SEGUIMIENTO', content: 'Progreso constante. Prefiere sesiones conjuntas con Marcos los martes a las 18:00.' },
      { clientId: lucia.id, category: 'LESION', content: 'Primera sesión de readaptación de rodilla superada sin molestias.' }
    ]
  });

  // 8. Crear bonos (Packs)
  console.log('Creando bonos con diferentes estados (caducidad inminente, pago pendiente, activos)...');

  const now = Date.now();

  // Bono 1: Marcos Delgado (Bono de 8 sesiones, le quedan 2, caduca en 3 días -> CRÍTICO/URGENTE)
  // purchasedAt hace 25 días, validez 4 semanas (28 días).
  const pkgMarcos = await prisma.clientServicePackage.create({
    data: {
      clientId: marcos.id,
      serviceId: sInd.id,
      sessionsBought: 8,
      totalAmount: 240.00,
      paymentMethod: 'TARJETA',
      paymentStatus: 'PAGADO',
      purchasedAt: new Date(now - 25 * 86400000),
      notes: 'Pack 8 Individual - Le quedan 2 sesiones por gastar antes de que expire el viernes.'
    }
  });

  // Bono 2: David Navarro (Bono Dual de 8 sesiones, 6 por agendar, caduca en 23 días)
  const pkgDavid = await prisma.clientServicePackage.create({
    data: {
      clientId: david.id,
      serviceId: sDual.id,
      sessionsBought: 8,
      totalAmount: 180.00,
      paymentMethod: 'TARJETA',
      paymentStatus: 'PAGADO',
      purchasedAt: new Date(now - 5 * 86400000),
      notes: 'Pack 8 Dual con Marcos Delgado.'
    }
  });

  // Bono 3: Lucía Méndez (Bono de 4 sesiones, PAGO PENDIENTE -> para probar filtro de cobro)
  const pkgLucia = await prisma.clientServicePackage.create({
    data: {
      clientId: lucia.id,
      serviceId: sInd.id,
      sessionsBought: 4,
      totalAmount: 140.00,
      paymentMethod: 'EFECTIVO',
      paymentStatus: 'PENDIENTE',
      purchasedAt: new Date(now - 2 * 86400000),
      notes: 'Bono reservado por teléfono. Abonará en recepción en su primera cita.'
    }
  });

  // Bono 4: Alejandro Ortiz (Bono de 4 sesiones, caduca MAÑANA -> MÁXIMA PRIORIDAD 1)
  const pkgAlejandro = await prisma.clientServicePackage.create({
    data: {
      clientId: alejandro.id,
      serviceId: sInd.id,
      sessionsBought: 4,
      totalAmount: 140.00,
      paymentMethod: 'BIZUM',
      paymentStatus: 'PAGADO',
      purchasedAt: new Date(now - 27 * 86400000),
      notes: 'Caduca mañana. Urge agendar las sesiones restantes.'
    }
  });

  // Bono 5: Sofía Ramos (Bono de 8 sesiones en Cobosu / TP)
  const pkgSofia = await prisma.clientServicePackage.create({
    data: {
      clientId: sofia.id,
      serviceId: sInd.id,
      sessionsBought: 8,
      totalAmount: 240.00,
      paymentMethod: 'TARJETA',
      paymentStatus: 'PAGADO',
      purchasedAt: new Date(now - 10 * 86400000),
      notes: 'Pack 8 Individual activo.'
    }
  });

  // 9. Crear reservas (Bookings) en public.Booking y calendar.bookings
  console.log('Creando reservas en calendario: sesiones DUAL, cita sin entrenador, y cita por reprogramar...');

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(now + 86400000);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

  // Cita 1: Sesión DUAL compartida entre Marcos y David mañana a las 18:00
  const dualSessionId = randomUUID();
  const bDualMarcosId = randomUUID();
  const bDualDavidId = randomUUID();

  // Booking Marcos en Prisma
  await prisma.booking.create({
    data: {
      id: bDualMarcosId,
      clientId: marcos.id,
      serviceId: sDual.id,
      packageId: pkgMarcos.id,
      employeeId: trainerId,
      calendarGymId: gym.id,
      startTime: new Date(`${tomorrowStr}T18:00:00Z`),
      endTime: new Date(`${tomorrowStr}T19:00:00Z`),
      status: 'CONFIRMADA',
      attendance: 'PENDIENTE'
    }
  });
  // Booking David en Prisma
  await prisma.booking.create({
    data: {
      id: bDualDavidId,
      clientId: david.id,
      serviceId: sDual.id,
      packageId: pkgDavid.id,
      employeeId: trainerId,
      calendarGymId: gym.id,
      startTime: new Date(`${tomorrowStr}T18:00:00Z`),
      endTime: new Date(`${tomorrowStr}T19:00:00Z`),
      status: 'CONFIRMADA',
      attendance: 'PENDIENTE'
    }
  });

  // En calendar.bookings para el calendario visual
  await pool.query(
    'INSERT INTO calendar.bookings (id, gym_id, data) VALUES ($1, $2, $3), ($4, $5, $6)',
    [
      bDualMarcosId, gym.id, JSON.stringify({
        id: bDualMarcosId,
        date: tomorrowStr,
        start: '18:00',
        end: '19:00',
        roomId: 'r1',
        status: 'CONFIRMED',
        clientId: marcos.id,
        employeeId: trainerId,
        serviceId: sDual.id,
        packageId: pkgMarcos.id,
        sessionId: dualSessionId,
        centerId: gym.id,
        centerName: gym.name,
        needsReschedule: false,
        recoveryId: null,
        notes: 'Sesión DUAL con su amigo David Navarro.',
        version: 1,
        history: []
      }),
      bDualDavidId, gym.id, JSON.stringify({
        id: bDualDavidId,
        date: tomorrowStr,
        start: '18:00',
        end: '19:00',
        roomId: 'r1',
        status: 'CONFIRMED',
        clientId: david.id,
        employeeId: trainerId,
        serviceId: sDual.id,
        packageId: pkgDavid.id,
        sessionId: dualSessionId,
        centerId: gym.id,
        centerName: gym.name,
        needsReschedule: false,
        recoveryId: null,
        notes: 'Sesión DUAL con su amigo Marcos Delgado.',
        version: 1,
        history: []
      })
    ]
  );

  // Cita 2: CITA SIN ENTRENADOR ASIGNADO para Lucía Méndez mañana a las 11:00
  // (Para probar la pestaña "Por organizar" -> "Citas sin trabajador")
  const bLuciaId = randomUUID();
  await prisma.booking.create({
    data: {
      id: bLuciaId,
      clientId: lucia.id,
      serviceId: sInd.id,
      packageId: pkgLucia.id,
      employeeId: null, // ¡Sin entrenador!
      calendarGymId: gym.id,
      startTime: new Date(`${tomorrowStr}T11:00:00Z`),
      endTime: new Date(`${tomorrowStr}T12:00:00Z`),
      status: 'PENDIENTE',
      attendance: 'PENDIENTE'
    }
  });
  await pool.query(
    'INSERT INTO calendar.bookings (id, gym_id, data) VALUES ($1, $2, $3)',
    [
      bLuciaId, gym.id, JSON.stringify({
        id: bLuciaId,
        date: tomorrowStr,
        start: '11:00',
        end: '12:00',
        roomId: 'r1',
        status: 'PENDING',
        clientId: lucia.id,
        employeeId: null, // ¡Sin asignar!
        serviceId: sInd.id,
        packageId: pkgLucia.id,
        centerId: gym.id,
        centerName: gym.name,
        needsReschedule: false,
        recoveryId: null,
        notes: 'Cita reservada por Lucía Méndez pendiente de asignar entrenador.',
        version: 1,
        history: []
      })
    ]
  );

  // Cita 3: CITA POR REPROGRAMAR para Elena Morales
  // (Para probar la pestaña "Reprogramar / Recuperar")
  const bElenaId = randomUUID();
  await prisma.booking.create({
    data: {
      id: bElenaId,
      clientId: elena.id,
      serviceId: sInd.id,
      packageId: null,
      employeeId: trainerId,
      calendarGymId: gym.id,
      startTime: new Date(`${todayStr}T16:00:00Z`),
      endTime: new Date(`${todayStr}T17:00:00Z`),
      status: 'CANCELADA',
      attendance: 'PENDIENTE'
    }
  });
  await pool.query(
    'INSERT INTO calendar.bookings (id, gym_id, data) VALUES ($1, $2, $3)',
    [
      bElenaId, gym.id, JSON.stringify({
        id: bElenaId,
        date: todayStr,
        start: '16:00',
        end: '17:00',
        roomId: 'r1',
        status: 'CANCELLED',
        clientId: elena.id,
        employeeId: trainerId,
        serviceId: sInd.id,
        packageId: null,
        centerId: gym.id,
        centerName: gym.name,
        needsReschedule: true, // ¡Marcada para reprogramar!
        recoveryId: null,
        notes: 'Canceló por viaje de trabajo. Pendiente de reprogramar nueva fecha.',
        version: 2,
        history: []
      })
    ]
  );

  // Cita 4: Crédito de recuperación para Elena Morales
  const recId = randomUUID();
  await pool.query(
    'INSERT INTO calendar.recoveries (id, gym_id, original_id, data) VALUES ($1, $2, $3, $4)',
    [
      recId, gym.id, bElenaId, JSON.stringify({
        id: recId,
        gymId: gym.id,
        clientId: elena.id,
        serviceId: sInd.id,
        employeeId: trainerId,
        status: 'PENDING',
        originalDate: todayStr,
        reason: 'Cancelación con más de 24h de preaviso. Crédito disponible.'
      })
    ]
  );

  console.log('--- Datos de prueba creados exitosamente en la base de datos local ---');
  console.log(`
Resumen de datos cargados para pruebas:
1. Clientes con red de amigos:
   - Marcos Delgado Santos (Veterano, activo, 2 sesiones de bono restantes).
   - David Navarro Ibáñez (Amigo de Marcos, referido por él, entrenan juntos en sesión DUAL).
   - Lucía Méndez Peña (Amiga de Marcos y David, bono con cobro pendiente).
   - Sofía Ramos Castillo (Activa, bono de 8 sesiones).
   - Elena Morales Vidal (Amiga de Sofía, referida por ella, cita por reprogramar + crédito de recuperación).
   - Alejandro Ortiz Ruiz (Amigo de David, bono con caducidad inminente mañana).

2. Bonos y estado:
   - Marcos: 8 compradas, 6 consumidas, 2 por agendar (caduca en 3 días -> ALERTA URGENTE).
   - David: 8 compradas, 2 consumidas, 6 por agendar.
   - Lucía: 4 compradas, PAGO PENDIENTE -> para probar filtro de cobro.
   - Alejandro: 4 compradas, caduca mañana -> PRIORIDAD 1.

3. En el calendario y pendientes:
   - Sesión DUAL de mañana a las 18:00 (Marcos y David juntos con Yeray).
   - Cita sin entrenador asignado: Lucía Méndez mañana a las 11:00.
   - Cita por reprogramar: Elena Morales.
   - Crédito de recuperación disponible para Elena Morales.
  `);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
