import { Prisma, type PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { Pool,PoolClient } from "pg";
import { accessMigration } from "./access";
import {
ApiError,
Booking,
Config,
LeaveRequest,
assertAvailable,
assertTransition,
attendanceActionSchema,
bookingSchema,
clientSchema,
configSchema,
date,
employeeSchema,
haversineDistanceMeters,
label,
leaveRequestInputSchema,
normalize,
serviceSchema,
workerActionSchema
} from "./model";
export const migration = `CREATE SCHEMA IF NOT EXISTS calendar;
CREATE TABLE IF NOT EXISTS calendar.gyms(id text PRIMARY KEY, name text, config jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0);
ALTER TABLE calendar.gyms ADD COLUMN IF NOT EXISTS name text;
CREATE TABLE IF NOT EXISTS calendar.bookings(id text NOT NULL, gym_id text NOT NULL REFERENCES calendar.gyms(id), data jsonb NOT NULL, PRIMARY KEY(gym_id,id), CHECK(data->>'status' IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')));
CREATE TABLE IF NOT EXISTS calendar.recoveries(gym_id text NOT NULL REFERENCES calendar.gyms(id), id text NOT NULL, original_id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(gym_id,id), UNIQUE(gym_id,original_id));
CREATE INDEX IF NOT EXISTS bookings_date ON calendar.bookings(gym_id, (data->>'date'));
CREATE TABLE IF NOT EXISTS calendar.attendance(
  id text PRIMARY KEY,
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  employee_id text NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  CHECK(clock_out IS NULL OR clock_out >= clock_in)
);
ALTER TABLE calendar.attendance ADD COLUMN IF NOT EXISTS geo_in jsonb;
ALTER TABLE calendar.attendance ADD COLUMN IF NOT EXISTS geo_out jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_open_shift ON calendar.attendance(gym_id,employee_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS attendance_by_gym_and_time ON calendar.attendance(gym_id,clock_in DESC);`;
export class Store {
  constructor(public pool: Pool, public clientsDb?: PrismaClient) {}

  private async externalConfig(gym: string, raw: unknown) {
    const config = configSchema.parse(raw);
    if (!this.clientsDb) return config;
    const row = (await this.pool.query("SELECT name FROM calendar.gyms WHERE id=$1", [gym])).rows[0];
    if (!row) return config;
    const slug = (value: string) => value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const gyms = await this.clientsDb.gym.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const externalGym = gyms.find(item => item.id === row.name || slug(item.name) === slug(String(row.name)));
    if (!externalGym) return config;
    const clientsQuery = this.clientsDb.client.findMany({
      where: { gymId: externalGym.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, notes: true, status: true, birthDate: true, assignedWorkerId: true },
    });
    const servicesQuery = this.clientsDb.service.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        price: true,
        isActive: true,
        modality: true,
        type: true,
        trainingCount: true,
        validityWeeks: true,
        recommendedWeeklyFrequency: true,
        conditions: true,
      },
    });
    const [clients, services] = await Promise.all([clientsQuery, servicesQuery]);
    config.clients = clients.map(client => ({
      id: client.id,
      name: `${client.firstName} ${client.lastName}`.trim(),
      email: client.email,
      phone: client.phone,
      notes: client.notes || "",
      status: client.status === "ACTIVO" || client.status === "LEAD" ? "ACTIVE" as const : client.status === "BAJA" ? "BLOCKED" as const : "INACTIVE" as const,
      birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : "",
      assignedWorkerId: (client as any).assignedWorkerId || null,
    }));
    if (services.length) {
      const saved = config.services;
      const savedById = new Map(saved.map(service => [service.id, service]));
      const serviceIds = new Set(services.map(service => service.id));
      config.services = services.map(service => ({
        ...savedById.get(service.id),
        id: service.id,
        name: service.name,
        description: service.description || "",
        duration: service.durationMin,
        capacity: service.modality === "DUAL" ? 2 : 1,
        price: Number(service.price),
        active: service.isActive,
        modality: service.modality,
        type: service.type,
        trainingCount: service.trainingCount,
        validityWeeks: service.validityWeeks,
        recommendedWeeklyFrequency: service.recommendedWeeklyFrequency,
        conditions: service.conditions,
      }));
      config.services.push(...saved.filter(s => !serviceIds.has(s.id)));
    }
    const allCenters = await this.centers();
    config.centers = allCenters;
    const currentCenter = allCenters.find(item => item.id === externalGym.id || item.name === externalGym.name);
    if (currentCenter?.maxBookingsPerHour != null) {
      config.maxBookingsPerHour = currentCenter.maxBookingsPerHour;
    }
    return config;
  }
  async migrate() {
    await this.pool.query(migration);
    await this.pool.query(accessMigration);
  }
  async seed(gym: string, config: Config) {
    await this.pool.query(
      "INSERT INTO calendar.gyms(id,name,config) VALUES($1,$1,$2) ON CONFLICT (id) DO UPDATE SET name=COALESCE(calendar.gyms.name, EXCLUDED.name)",
      [gym, configSchema.parse(config)],
    );
  }
  async listGyms() {
    return (await this.pool.query("SELECT id,name,config FROM calendar.gyms ORDER BY name NULLS LAST,id")).rows
      .map((row) => ({
        id: row.id as string,
        name: (row.name || row.id) as string,
        maxBookingsPerHour: row.config?.maxBookingsPerHour != null ? Number(row.config.maxBookingsPerHour) : null,
      }));
  }
  async gymExists(gym: string) {
    return Boolean((await this.pool.query("SELECT 1 FROM calendar.gyms WHERE id=$1", [gym])).rowCount);
  }
  async createGym(name: string, templateGym: string) {
    const id = `${name.toLocaleLowerCase("es").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "gimnasio"}-${randomUUID().slice(0, 8)}`;
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const source = await db.query("SELECT config FROM calendar.gyms WHERE id=$1", [templateGym]);
      if (!source.rows.length) throw new ApiError(404, "No se encontró el gimnasio base.");
      const config = configSchema.parse(source.rows[0].config);
      await db.query("INSERT INTO calendar.gyms(id,name,config) VALUES($1,$2,$3)", [id, name.trim(), config]);
      await db.query("COMMIT");
      return { id, name: name.trim() };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  // Every writer locks the same persisted gym row BEFORE reading bookings. READ COMMITTED
  // gives waiting writers a fresh snapshot after the prior writer commits. Works across processes.
  async transaction<T>(
    gym: string,
    fn: (
      db: PoolClient,
      c: Config,
      bookings: Booking[],
      revision: number,
    ) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout = '5s'");
      const { rows } = await db.query(
        "SELECT config,revision FROM calendar.gyms WHERE id=$1 FOR UPDATE",
        [gym],
      );
      if (!rows.length) throw new ApiError(404, "Gimnasio desconocido.");
      const bookings = (
        await db.query("SELECT data FROM calendar.bookings WHERE gym_id=$1", [
          gym,
        ])
      ).rows.map((r) => r.data as Booking);
      const result = await fn(
        db,
        await this.externalConfig(gym, rows[0].config),
        bookings,
        Number(rows[0].revision),
      );
      await db.query(
        "UPDATE calendar.gyms SET revision=revision+1 WHERE id=$1",
        [gym],
      );
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async centers() {
    if (this.clientsDb) {
      try {
        const rows = await this.clientsDb.$queryRaw<Array<{
          id: string;
          name: string;
          address: string | null;
          city: string | null;
          province: string | null;
          maxBookingsPerHour: number | null;
        }>>(Prisma.sql`SELECT "id", "name", "address", "city", "province", "maxBookingsPerHour" FROM "Gym" WHERE "isActive" = true ORDER BY "name" ASC`);
        return rows.map((r) => ({
          ...r,
          maxBookingsPerHour: r.maxBookingsPerHour != null ? Number(r.maxBookingsPerHour) : null,
        }));
      } catch {
        return this.clientsDb.gym.findMany({
          where: { isActive: true },
          select: { id: true, name: true, address: true, city: true, province: true },
          orderBy: { name: "asc" },
        }).then((list) => list.map((g) => ({ ...g, maxBookingsPerHour: null })));
      }
    }
    return (await this.listGyms()).map(g=>({...g,address:'',city:'',province:''}));
  }
  async state(gym: string) {
    // Single statement: config and bookings share a consistent snapshot.
    const { rows } = await this.pool.query(
      `SELECT config,revision,COALESCE((SELECT jsonb_agg(data ORDER BY data->>'date',data->>'start') FROM calendar.bookings WHERE gym_id=g.id),'[]'::jsonb) bookings FROM calendar.gyms g WHERE id=$1`,
      [gym],
    );
    if (!rows.length) throw new ApiError(404, "Gimnasio desconocido.");
    const [centers, packageResult, config] = await Promise.all([
      this.centers(),
      this.clientsDb ? this.pool.query('SELECT b.id,b."saleId",b."paymentPending",p."paymentStatus" FROM "Booking" b LEFT JOIN "ClientServicePackage" p ON p.id=b."packageId" WHERE b."calendarGymId"=$1',[gym]) : Promise.resolve({rows:[]}),
      this.externalConfig(gym, rows[0].config),
    ]);
    const centersById = new Map(centers.map(center => [center.id, center]));
    const packagesByBooking = new Map(packageResult.rows.map(pkg => [pkg.id, pkg]));
    return {
      gymId:gym, centers, packagesEnabled:!!this.clientsDb,
      ...config,
      bookings: rows[0].bookings.map((b:Booking)=>{const center=centersById.get(b.centerId||gym);const linked=packagesByBooking.get(b.id);return {...b,...(linked?{paymentDue:!b.recoveryId&&(b.packageId?linked.paymentStatus!=='PAGADO':linked.paymentPending)}:{}),centerId:b.centerId||gym,centerName:center?.name||b.centerName||gym,centerAddress:[center?.address,center?.city,center?.province].filter(Boolean).join(', ')||b.centerAddress||''};}),
      revision: Number(rows[0].revision),
      version: 1,
    };
  }
  // The mirror and calendar JSON are written on the same PostgreSQL connection/transaction.
  private async syncPackageBooking(db:PoolClient,gym:string,b:Booking,c:Config){
    if(!this.clientsDb)return;
    if(!/^[0-9a-f-]{36}$/i.test(b.clientId)||!/^[0-9a-f-]{36}$/i.test(b.serviceId)){
      if(b.packageId)throw new ApiError(400,"Selecciona un cliente y servicio del catálogo para utilizar un bono.");
      return;
    }
    const real=(await db.query('SELECT 1 FROM "Client" c JOIN "Service" s ON s.id=$2::uuid WHERE c.id=$1::uuid AND c."gymId"=$3::uuid',[b.clientId,b.serviceId,gym])).rowCount;
    if(!real)throw new ApiError(400,"El cliente o servicio no pertenece al catálogo de este centro.");
    if(b.packageId&&b.recoveryId)throw new ApiError(400,"Selecciona un bono o una recuperación, sin utilizar ambos para la misma sesión.");
    // Keep the lock order: calendar centre, finance centre, package/booking rows.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[gym]);
    const billed=(await db.query('SELECT "saleId","clientId","serviceId","packageId","paymentPending" FROM "Booking" WHERE id=$1::uuid',[b.id])).rows[0];
    if(billed?.saleId && (billed.clientId!==b.clientId || billed.serviceId!==b.serviceId || (b.packageId||null)!==billed.packageId || b.recoveryId))
      throw new ApiError(409,"Esta sesión ya tiene una venta vinculada. No cambies el cliente, servicio o bono; revisa su cobro en la ficha.");
    let effectivePackageId=b.packageId;
    if(b.recoveryId){
      effectivePackageId=(await db.query('SELECT p."packageId" FROM calendar.recoveries r JOIN "Booking" p ON p.id::text=r.original_id WHERE r.gym_id=$1 AND r.id=$2',[gym,b.recoveryId])).rows[0]?.packageId||null;
    }
    let paid=false;
    if(effectivePackageId){
      const pkg=(await db.query('SELECT * FROM "ClientServicePackage" WHERE id=$1::uuid FOR UPDATE',[effectivePackageId])).rows[0];
      if(!pkg||pkg.clientId!==b.clientId||pkg.serviceId!==b.serviceId||!['PAGADO','PENDIENTE'].includes(pkg.paymentStatus))throw new ApiError(409,"El bono no es compatible con este cliente o servicio.");
      const count=Number((await db.query(`SELECT count(*) FROM "Booking" WHERE "packageId"=$1::uuid AND id<>$2::uuid AND attendance IN ('PENDIENTE','ASISTIO') AND status<>'CANCELADA'`,[pkg.id,b.id])).rows[0].count);
      const held=Number((await db.query(`SELECT count(*) FROM calendar.recoveries r JOIN "Booking" original ON original.id::text=r.original_id WHERE original."packageId"=$1::uuid AND r.gym_id=$2 AND r.id<>COALESCE($3,'') AND r.data->>'status' IN ('PENDING','RESCHEDULE_PENDING')`,[pkg.id,gym,b.recoveryId||null])).rows[0].count);
      if(!['CANCELLED','NO_SHOW'].includes(b.status)&&count+held>=pkg.sessionsBought)throw new ApiError(409,"Este bono ya no tiene sesiones disponibles. Actualiza los bonos del cliente.");
      paid=pkg.paymentStatus==='PAGADO';
    }
    if(billed?.saleId)paid=!billed.paymentPending;
    b.paymentDue=!paid&&!b.recoveryId;
    if(paid||b.recoveryId)b.chargeAmount=0;
    const start=DateTime.fromISO(`${b.date}T${b.start}`,{zone:c.timezone}).toJSDate(),end=DateTime.fromISO(`${b.date}T${b.end}`,{zone:c.timezone}).toJSDate();
    const status=({PENDING:'PENDIENTE',CONFIRMED:'CONFIRMADA',COMPLETED:'COMPLETADA',CANCELLED:'CANCELADA',NO_SHOW:'COMPLETADA'})[b.status];
    const attendance=({PENDING:'PENDIENTE',CONFIRMED:'PENDIENTE',COMPLETED:'ASISTIO',CANCELLED:'CANCELADA',NO_SHOW:'NO_ASISTIO'})[b.status];
    // Calendar employee IDs may be workspace identities rather than Prisma employees.
    const employee=b.employeeId&&/^[0-9a-f-]{36}$/i.test(b.employeeId)?(await db.query('SELECT id FROM "Employee" WHERE id=$1::uuid',[b.employeeId])).rows[0]?.id:null;
    await db.query(`INSERT INTO "Booking" (id,"clientId","serviceId","packageId","employeeId","startTime","endTime",status,attendance,"updatedAt","calendarGymId","paymentPending")
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8::"BookingStatus",$9::"AttendanceStatus",now(),$10,$11)
      ON CONFLICT(id) DO UPDATE SET "clientId"=EXCLUDED."clientId","serviceId"=EXCLUDED."serviceId","packageId"=EXCLUDED."packageId","employeeId"=EXCLUDED."employeeId","startTime"=EXCLUDED."startTime","endTime"=EXCLUDED."endTime",status=EXCLUDED.status,attendance=EXCLUDED.attendance,"updatedAt"=now(),"paymentPending"=EXCLUDED."paymentPending"`,[b.id,b.clientId,b.serviceId,effectivePackageId||null,employee,start,end,status,attendance,gym,b.paymentDue]);
    // Completing an unpaid single session creates one debt, never a receipt.
    if(b.status==='COMPLETED' && !effectivePackageId && !b.recoveryId && !billed?.saleId){
      const amount=Math.round((b.chargeAmount||0)*100)/100;
      if(amount>0){
        const saleId=randomUUID(),lineId=randomUUID();
        const serviceName=c.services.find(s=>s.id===b.serviceId)?.name||'Sesión';
        const cash=(await db.query('UPDATE "CashSession" SET revision=revision+1 WHERE "gymKey"=$1 AND "closedAt" IS NULL RETURNING id',[gym])).rows[0];
        await db.query(`INSERT INTO "Sale" (id,"gymKey","clientId","sellerAccountId",status,"paymentTracking",subtotal,"taxAmount","totalAmount","soldAt","updatedAt","cashSessionId")
          VALUES($1::uuid,$2,$3::uuid,$4,'COMPLETADA',true,$5,0,$5,now(),now(),$6::uuid)`,[saleId,gym,b.clientId,'calendar',amount,cash?.id||null]);
        await db.query(`INSERT INTO "SaleLine" (id,"saleId",type,"serviceId",description,quantity,"unitPrice","taxRate","lineSubtotal","taxAmount","lineTotal")
          VALUES($1::uuid,$2::uuid,'SERVICIO',$3::uuid,$4,1,$5,0,$5,0,$5)`,[lineId,saleId,b.serviceId,`Sesión · ${serviceName} · ${b.date} ${b.start}`,amount]);
        await db.query('UPDATE "Booking" SET "saleId"=$2::uuid WHERE id=$1::uuid',[b.id,saleId]);
      }else{
        b.paymentDue=false;
        await db.query('UPDATE "Booking" SET "paymentPending"=false WHERE id=$1::uuid',[b.id]);
      }
    }
  }
  async save(gym: string, raw: unknown, id?: string, newClient?: unknown, actorId="system", expectedEmployeeId?:string) {
    const input = bookingSchema.parse(raw);
    return this.transaction(gym, async (db, c, bookings) => {
      const old = id ? bookings.find((b) => b.id === id) : undefined;
      if(expectedEmployeeId && old?.employeeId!==expectedEmployeeId)throw new ApiError(404,"Reserva desconocida.");
      if (id && !old) throw new ApiError(404, "Reserva desconocida.");
      if (old && input.version !== old.version)
        throw new ApiError(
          409,
          "La reserva cambió. Cierra la ficha y vuelve a abrirla.",
        );
      if (newClient) {
        const client = clientSchema.parse(newClient);
        if (c.clients.some((x) => x.id === client.id))
          throw new ApiError(409, "Cliente duplicado.");
        c.clients.push(client);
      }
      const b = normalize(
        { ...input, id: id || randomUUID(), version: old?.version || 1 },
        c,
      );
      b.centerId=input.centerId || old?.centerId || gym;
      const allCenters = await this.centers();
      c.centers = allCenters;
      const center = allCenters.find(x => x.id === b.centerId);
      if(!center && b.centerId!==gym)throw new ApiError(400,"Centro desconocido o inactivo.");
      b.centerName=center?.name || gym;
      b.centerAddress=[center?.address,center?.city,center?.province].filter(Boolean).join(', ');
      if(old?.needsReschedule && !b.needsReschedule && b.status !== 'CANCELLED' && DateTime.fromISO(`${b.date}T${b.start}`,{zone:c.timezone}).toMillis()<=Date.now())throw new ApiError(409,"Elige una fecha y hora futuras para reprogramar.");
      b.history=old?.history || [];
      b.incidents=old?.incidents || [];
      if(old){const {history,incidents,...previous}=old;b.history=[...b.history,{at:new Date().toISOString(),actorId,action:b.needsReschedule?'RESCHEDULE_REQUESTED':!old.employeeId&&b.employeeId?'ASSIGNED':'UPDATED',previous}];}
      if (!old || (b.status !== "CANCELLED" && ["clientId","employeeId","serviceId","date","start","status"].some(k => (b as any)[k] !== (old as any)[k])))
        this.assertActive(b, c);
      if (old && b.status !== "CANCELLED" && (await db.query("SELECT 1 FROM calendar.recoveries WHERE gym_id=$1 AND original_id=$2",[gym,old.id])).rowCount) throw new ApiError(409,"La sesión original tiene una recuperación. Programa la recuperación en lugar de reactivar la original.");
      if (old) assertTransition(old, b, c);
      else if (!["PENDING", "CONFIRMED"].includes(b.status))
        throw new ApiError(
          400,
          "Una nueva cita debe estar pendiente o confirmada.",
        );
      assertAvailable(b, bookings.map(o=>({...o,centerId:o.centerId||gym})), c);
      if (old && (old.recoveryId || null) !== (b.recoveryId || null)) throw new ApiError(409, "No se puede cambiar la recuperación de una reserva.");
      if (b.recoveryId) {
        const row = (await db.query("SELECT data FROM calendar.recoveries WHERE gym_id=$1 AND id=$2",[gym,b.recoveryId])).rows[0];
        const credit = row?.data;
        if (!credit || credit.clientId !== b.clientId || credit.serviceId !== b.serviceId) throw new ApiError(409, "Recuperación incompatible.");
        if (!old && (credit.status !== "PENDING" || b.status !== "CONFIRMED")) throw new ApiError(409, "La recuperación debe estar pendiente y confirmarse en esta reserva.");
        if (old && credit.bookingId !== old.id) throw new ApiError(409, "Esta recuperación ya se utilizó.");
        b.chargeAmount = 0;
        credit.bookingId = b.id;
        credit.status = b.status === "COMPLETED" ? "COMPLETED" : b.status === "NO_SHOW" ? "FORFEITED" : "SCHEDULED";
        if (b.status === "CANCELLED") {
          const notice = DateTime.fromISO(`${old!.date}T${old!.start}`, {zone:c.timezone}).toMillis() - Date.now();
          credit.status = b.needsReschedule ? "RESCHEDULE_PENDING" : notice >= 2*3600000 ? "PENDING" : "FORFEITED";
          if (credit.status === "PENDING") credit.bookingId = null;
        }
        await db.query("UPDATE calendar.recoveries SET data=$3 WHERE gym_id=$1 AND id=$2",[gym,b.recoveryId,credit]);
      } else b.chargeAmount = old?.chargeAmount ?? c.services.find(s=>s.id===b.serviceId)?.price ?? 0;
      await this.syncPackageBooking(db,gym,b,c);
      if (old) b.version++;
      await db.query(
        "INSERT INTO calendar.bookings(id,gym_id,data) VALUES($1,$2,$3) ON CONFLICT(gym_id,id) DO UPDATE SET data=EXCLUDED.data",
        [b.id, gym, b],
      );
      if (newClient)
        await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [
          gym,
          c,
        ]);
      return b;
    });
  }
  async workerAction(gym:string,id:string,actor:{id:string;employeeId:string|null},raw:unknown){
    const input=workerActionSchema.parse(raw);
    if(input.action==='COMPLETE'){
      const s=await this.state(gym);const old=s.bookings.find((b:Booking)=>b.id===id&&b.employeeId===actor.employeeId);
      if(!actor.employeeId||!old)throw new ApiError(404,"Reserva desconocida.");
      return this.save(gym,{...old,status:'COMPLETED',version:input.version},id,undefined,actor.id,actor.employeeId!);
    }
    return this.transaction(gym,async(db,c,bookings)=>{
      const old=bookings.find(b=>b.id===id&&b.employeeId===actor.employeeId);
      if(!actor.employeeId||!old)throw new ApiError(404,"Reserva desconocida.");
      if(old.version!==input.version)throw new ApiError(409,"La reserva cambió. Actualiza antes de continuar.");
      const message=input.message?.trim();if(!message)throw new ApiError(400,"Escribe la incidencia.");
      old.incidents=[...(old.incidents||[]),{at:new Date().toISOString(),actorId:actor.id,message}];old.version++;
      await db.query("UPDATE calendar.bookings SET data=$3 WHERE gym_id=$1 AND id=$2",[gym,id,old]);return old;
    });
  }
  async recoveries(gym: string) {
    return (await this.pool.query("SELECT data FROM calendar.recoveries WHERE gym_id=$1 ORDER BY data->>'createdAt' DESC",[gym])).rows.map(r=>r.data);
  }
  async deferBooking(gym: string, id: string, actor: {id:string;role:string;employeeId:string|null}, exception = false) {
    return this.transaction(gym,async(db,c,bookings)=>{
      const b = bookings.find(b=>b.id===id);
      if (!b || (actor.role === "TRAINER" && b.employeeId !== actor.employeeId)) throw new ApiError(404,"Reserva desconocida.");
      if (!["CONFIRMED"].includes(b.status) || b.recoveryId) throw new ApiError(409,"Solo una sesión confirmada original puede dejarse pendiente.");
      const remaining = DateTime.fromISO(`${b.date}T${b.start}`,{zone:c.timezone}).toMillis()-Date.now();
      if (remaining <= 0) throw new ApiError(409,"La sesión ya ha comenzado.");
      if (remaining < 2*3600000 && !(actor.role === "ADMIN" && exception)) throw new ApiError(409,"Se requieren dos horas de antelación o una excepción de administración.");
      const credit = {id:randomUUID(), originalId:b.id, clientId:b.clientId, serviceId:b.serviceId, employeeId:b.employeeId, status:"PENDING", bookingId:null, createdAt:new Date().toISOString(), actorId:actor.id, exception:remaining<2*3600000};
      await db.query("INSERT INTO calendar.recoveries(gym_id,id,original_id,data) VALUES($1,$2,$3,$4)",[gym,credit.id,b.id,credit]);
      b.status="CANCELLED"; b.version++;
      await this.syncPackageBooking(db,gym,b,c);
      await db.query("UPDATE calendar.bookings SET data=$3 WHERE gym_id=$1 AND id=$2",[gym,b.id,b]);
      return credit;
    });
  }
  async configure(gym: string, raw: unknown, revision: number) {
    const config = configSchema.parse(raw);
    return this.transaction(gym, async (db, _c, bookings, current) => {
      if (revision !== current)
        throw new ApiError(
          409,
          "Los datos han cambiado. Actualiza antes de guardar.",
        );
      await this.validateConfig(db, gym, config, bookings);
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [
        gym,
        config,
      ]);
      return config;
    });
  }
  private assertActive(b: Booking, c: Config) {
    if (b.status === "CANCELLED") return;
    if ((c.clients.find(x => x.id === b.clientId)?.status || "ACTIVE") !== "ACTIVE")
      throw new ApiError(409, "El cliente está inactivo o bloqueado.");
    if (c.employees.find(x => x.id === b.employeeId)?.active === false || c.services.find(x => x.id === b.serviceId)?.active === false)
      throw new ApiError(409, "El empleado o servicio está inactivo.");
  }
  private async validateConfig(db: PoolClient, gym: string, config: Config, bookings: Booking[]) {
    configSchema.parse(config);
    const today = DateTime.now().setZone(config.timezone).toISODate()!;
    config.centers = await this.centers();
    for (const b of bookings) {
      for (const [list,key] of [["clients","clientId"],["services","serviceId"],["employees","employeeId"],["rooms","roomId"]] as const)
        if (b[key] !== null && !config[list].some(x => x.id === b[key])) throw new ApiError(409, "No se pueden eliminar fichas con historial. Usa el estado inactivo.");
      if (["PENDING","CONFIRMED"].includes(b.status) && b.date >= today) {
        normalize(b, config);
        if ((config.clients.find(x=>x.id===b.clientId)?.status || "ACTIVE") !== "ACTIVE" || config.employees.find(x=>x.id===b.employeeId)?.active === false) throw new ApiError(409,"El cliente o empleado está inactivo.");
        assertAvailable({...b,centerId:b.centerId||gym}, bookings.map(o=>({...o,centerId:o.centerId||gym})), config);
      }
    }
    const linked = (await db.query(`SELECT employee_id FROM calendar.attendance WHERE gym_id=$1
      UNION SELECT employee_id FROM calendar.users WHERE gym_id=$1`, [gym])).rows;
    if (linked.some(r => !config.employees.some(e => e.id === r.employee_id)))
      throw new ApiError(409, "El empleado tiene fichajes o usuario. Desactívalo en lugar de eliminarlo.");
    const open = (await db.query("SELECT employee_id FROM calendar.attendance WHERE gym_id=$1 AND clock_out IS NULL", [gym])).rows;
    if (open.some(r => config.employees.find(e => e.id === r.employee_id)?.active === false))
      throw new ApiError(409, "Cierra la jornada del empleado antes de desactivarlo.");
    const admins = (await db.query("SELECT employee_id FROM calendar.users WHERE gym_id=$1 AND role='ADMIN' AND enabled", [gym])).rows;
    if (admins.length && !admins.some(r => config.employees.find(e => e.id === r.employee_id)?.active !== false))
      throw new ApiError(409, "Debe quedar al menos un administrador activo.");
  }
  async manage(gym: string, kind: string, raw: unknown, revision: number, id?: string) {
    if (!["clients","services","employees"].includes(kind)) throw new ApiError(404, "Sección desconocida.");
    const schema = kind === "clients" ? clientSchema : kind === "services" ? serviceSchema : employeeSchema;
    const record = schema.parse({ ...(raw as object), id: id || randomUUID() });
    return this.transaction(gym, async (db,c,bookings,current) => {
      if (revision !== current) throw new ApiError(409, "Los datos han cambiado. Cierra la ficha, actualiza y vuelve a intentarlo.");
      const list = c[kind as "clients"] as any[];
      const index = list.findIndex(x => x.id === id);
      if (id && index < 0) throw new ApiError(404, "Ficha desconocida.");
      if (id) list[index] = record; else list.push(record);
      await this.validateConfig(db,gym,c,bookings);
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym,c]);
      return record;
    });
  }
  async leaves(gym: string, employeeId?: string) {
    const state = await this.state(gym);
    return state.leaveRequests
      .filter((leave: LeaveRequest) => !employeeId || leave.employeeId === employeeId)
      .sort((a: LeaveRequest, b: LeaveRequest) => b.createdAt.localeCompare(a.createdAt));
  }
  async requestLeave(gym: string, employeeId: string, raw: unknown) {
    const input = leaveRequestInputSchema.parse(raw);
    return this.transaction(gym, async (db, c) => {
      const employee = c.employees.find((item) => item.id === employeeId);
      if (!employee || employee.active === false) throw new ApiError(404, "Empleado desconocido o inactivo.");
      const leave: LeaveRequest = {
        id: randomUUID(), employeeId, ...input, status: "PENDING",
        createdAt: new Date().toISOString(), reviewedAt: null, reviewerId: null,
      };
      c.leaveRequests.push(leave);
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym, c]);
      return leave;
    });
  }
  async reviewLeave(gym: string, id: string, status: "APPROVED" | "REJECTED", reviewerId: string) {
    return this.transaction(gym, async (db, c, bookings) => {
      const leave = c.leaveRequests.find((item) => item.id === id);
      if (!leave) throw new ApiError(404, "Solicitud desconocida.");
      if (leave.status !== "PENDING") throw new ApiError(409, "Esta solicitud ya fue revisada.");
      if (status === "APPROVED") {
        const conflict = bookings.find((booking) => booking.employeeId === leave.employeeId &&
          ["PENDING", "CONFIRMED"].includes(booking.status) &&
          booking.date >= leave.startDate && booking.date <= leave.endDate);
        if (conflict) throw new ApiError(409, "Hay reservas activas en esas fechas. Reasígnalas o cancélalas antes de aprobar la ausencia.");
      }
      leave.status = status;
      leave.reviewedAt = new Date().toISOString();
      leave.reviewerId = reviewerId;
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym, c]);
      return leave;
    });
  }
  async cancelLeave(gym: string, id: string, employeeId: string) {
    return this.transaction(gym, async (db, c) => {
      const leave = c.leaveRequests.find((item) => item.id === id);
      if (!leave || leave.employeeId !== employeeId) throw new ApiError(404, "Solicitud desconocida.");
      if (leave.status !== "PENDING") throw new ApiError(409, "Solo puedes retirar solicitudes pendientes.");
      leave.status = "CANCELLED";
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym, c]);
      return leave;
    });
  }
  async slots(gym: string, query: Record<string, string>) {
    const day = date.parse(query.date),
      c = (await this.state(gym)) as Config & { bookings: Booking[] };
    const service = c.services.find((s) => s.id === query.serviceId);
    if (
      !service ||
      !c.employees.some((e) => e.id === query.employeeId) ||
      !c.rooms.some((r) => r.id === query.roomId)
    )
      throw new ApiError(400, "Recursos desconocidos.");
    if (service.active === false || c.employees.find(e => e.id === query.employeeId)?.active === false) return [];
    c.centers = await this.centers();
    const slots = [];
    for (let start = 0; start + service.duration < 1440; start += 15) {
      try {
        const b = normalize(
          {
            clientId: c.clients[0]?.id || "slot-preview",
            employeeId: query.employeeId,
            serviceId: query.serviceId,
            roomId: query.roomId,
            date: day,
            start: label(start),
            status: "PENDING",
            needsReschedule:false,
            notes: "",
            sessionId: query.sessionId,
          },
          {
            ...c,
            clients: [
              ...c.clients,
              { id: "slot-preview", name: "", email: "", phone: "", notes: "" },
            ],
          },
        );
        b.clientId = "slot-preview";
        b.centerId=query.centerId||gym;
        if(query.excludeId)b.id=query.excludeId;
        assertAvailable(b, c.bookings.map(o=>({...o,centerId:o.centerId||gym})), c);
        slots.push({ start: b.start, end: b.end });
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
      }
    }
    return slots;
  }

  async attendance(gym: string, from?: string, to?: string, employeeId?: string, viewerRole?: string) {
    const current = await this.state(gym);
    const zone = current.timezone;
    const first = from
      ? date.parse(from)
      : DateTime.now().setZone(zone).toISODate()!;
    const last = to ? date.parse(to) : first;
    const start = DateTime.fromISO(first, { zone }).startOf("day");
    const end = DateTime.fromISO(last, { zone }).plus({ days: 1 }).startOf("day");
    if (end.diff(start, "days").days > 93)
      throw new ApiError(400, "El historial permite consultar hasta 93 días.");
    if (end <= start) throw new ApiError(400, "Rango de fechas inválido.");
    const { rows } = await this.pool.query(
      `SELECT id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut",
              geo_in AS "geoIn",geo_out AS "geoOut"
       FROM calendar.attendance
       WHERE gym_id=$1 AND clock_in < $3 AND COALESCE(clock_out,now()) >= $2
       ORDER BY clock_in DESC`,
      [gym, start.toUTC().toISO(), end.toUTC().toISO()],
    );

    let employeesList = current.employees;
    let recordsList = rows;

    if (viewerRole === "TRAINER" || viewerRole === "RECEPTION") {
      employeesList = current.employees.filter((e: any) => e.id === employeeId);
      recordsList = rows.filter(r => r.employeeId === employeeId);
    } else if (employeeId) {
      employeesList = current.employees.filter((e: any) => e.id === employeeId);
      recordsList = rows.filter(r => r.employeeId === employeeId);
    }

    return {
      timezone: zone,
      centerLocation: (current as any).location || null,
      employees: employeesList.filter((e: any) => (!employeeId || e.id === employeeId) && (e.active !== false || recordsList.some(r => r.employeeId === e.id))).map(
        ({ id, name, color }: { id: string; name: string; color: string }) => ({
          id,
          name,
          color,
        }),
      ),
      records: recordsList,
      serverNow: new Date().toISOString(),
      from: first,
      to: last,
    };
  }

  async clock(gym: string, raw: unknown) {
    const input = attendanceActionSchema.parse(raw);
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout = '5s'");
      const gymResult = await db.query(
        "SELECT config FROM calendar.gyms WHERE id=$1 FOR SHARE",
        [gym],
      );
      if (!gymResult.rows.length)
        throw new ApiError(404, "Gimnasio desconocido.");
      const employee = gymResult.rows[0].config.employees.find(
        (item: { id: string }) => item.id === input.employeeId,
      );
      if (!employee) throw new ApiError(404, "Empleado desconocido.");
      if (employee.active === false && input.action === "IN") throw new ApiError(409, "Empleado inactivo.");
      const open = await db.query(
        `SELECT id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut"
         FROM calendar.attendance
         WHERE gym_id=$1 AND employee_id=$2 AND clock_out IS NULL
         FOR UPDATE`,
        [gym, input.employeeId],
      );
      let geoRecord: any = null;
      if (input.geo && typeof input.geo.latitude === "number" && typeof input.geo.longitude === "number") {
        const gymConfig = gymResult.rows[0].config;
        const gymLoc = gymConfig ? (gymConfig as any).location : null;
        let distanceMeters: number | null = null;
        let inGeofence: boolean | null = null;

        if (gymLoc && typeof gymLoc.latitude === "number" && typeof gymLoc.longitude === "number") {
          distanceMeters = haversineDistanceMeters(
            input.geo.latitude,
            input.geo.longitude,
            gymLoc.latitude,
            gymLoc.longitude,
          );
          const radius = gymLoc.radiusMeters || 200;
          inGeofence = distanceMeters <= radius;
        }

        geoRecord = {
          latitude: input.geo.latitude,
          longitude: input.geo.longitude,
          accuracy: input.geo.accuracy ?? null,
          distanceMeters,
          inGeofence,
          recordedAt: new Date().toISOString(),
        };
      }

      let row;
      if (input.action === "IN") {
        if (open.rows.length)
          throw new ApiError(409, `${employee.name} ya tiene una jornada abierta.`);
        row = (
          await db.query(
            `INSERT INTO calendar.attendance(id,gym_id,employee_id,geo_in)
             VALUES($1,$2,$3,$4)
             RETURNING id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut",
                       geo_in AS "geoIn",geo_out AS "geoOut"`,
            [randomUUID(), gym, input.employeeId, geoRecord ? JSON.stringify(geoRecord) : null],
          )
        ).rows[0];
      } else {
        if (!open.rows.length)
          throw new ApiError(409, `${employee.name} no tiene una jornada abierta.`);
        row = (
          await db.query(
            `UPDATE calendar.attendance SET clock_out=now(), geo_out=$2 WHERE id=$1
             RETURNING id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut",
                       geo_in AS "geoIn",geo_out AS "geoOut"`,
            [open.rows[0].id, geoRecord ? JSON.stringify(geoRecord) : null],
          )
        ).rows[0];
      }
      await db.query("COMMIT");
      return row;
    } catch (error) {
      await db.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505")
        throw new ApiError(409, "Este empleado ya tiene una jornada abierta.");
      throw error;
    } finally {
      db.release();
    }
  }
}
