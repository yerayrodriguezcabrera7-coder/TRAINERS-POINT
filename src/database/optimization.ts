// Database query optimization with indexes
export const databaseOptimization = `
-- Optimizar índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS bookings_gym_date ON calendar.bookings(gym_id, (data->>'date'));
CREATE INDEX IF NOT EXISTS bookings_gym_status ON calendar.bookings(gym_id, (data->>'status'));
CREATE INDEX IF NOT EXISTS bookings_gym_employee ON calendar.bookings(gym_id, (data->>'employeeId'));
CREATE INDEX IF NOT EXISTS bookings_gym_client ON calendar.bookings(gym_id, (data->>'clientId'));

-- Optimizar índices para clientes
CREATE INDEX IF NOT EXISTS clients_gym_status ON "Client"("gymId", "status");
CREATE INDEX IF NOT EXISTS clients_gym_assigned ON "Client"("gymId", "assignedWorkerId");
CREATE INDEX IF NOT EXISTS clients_email ON "Client"(LOWER("email"));
CREATE INDEX IF NOT EXISTS clients_phone ON "Client"(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'));

-- Optimizar índices para servicios
CREATE INDEX IF NOT EXISTS services_gym_active ON "Service"("gymId", "isActive");

-- Optimizar índices para bonos
CREATE INDEX IF NOT EXISTS packages_client ON "ClientServicePackage"("clientId");
CREATE INDEX IF NOT EXISTS packages_active ON "ClientServicePackage"("isActive");

-- Optimizar índices para asistencias
CREATE INDEX IF NOT EXISTS attendance_gym_employee ON calendar.attendance(gym_id, employee_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS attendance_open ON calendar.attendance(gym_id, employee_id) WHERE clock_out IS NULL;

-- Optimizar índices para planes de entrenamiento
CREATE INDEX IF NOT EXISTS training_plans_client ON "TrainingPlan"("clientId");
CREATE INDEX IF NOT EXISTS training_plans_status ON "TrainingPlan"("status");

-- Optimizar índices para notificaciones
CREATE INDEX IF NOT EXISTS reminders_gym ON "Reminder"("gymKey");
CREATE INDEX IF NOT EXISTS reminders_active ON "Reminder"("activeAt", "processed");

-- Compresión de tablas grandes (PostgreSQL 12+)
ALTER TABLE "Client" SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE "Booking" SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE "ClientServicePackage" SET (autovacuum_vacuum_scale_factor = 0.05);
`;