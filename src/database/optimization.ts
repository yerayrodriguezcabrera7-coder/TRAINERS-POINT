// Calendar data can live in a dedicated database, so its indexes must not be
// mixed with the CRM tables managed by Prisma.
export const calendarDatabaseOptimization = `
CREATE INDEX IF NOT EXISTS bookings_gym_date ON calendar.bookings(gym_id, (data->>'date'));
CREATE INDEX IF NOT EXISTS bookings_gym_status ON calendar.bookings(gym_id, (data->>'status'));
CREATE INDEX IF NOT EXISTS bookings_gym_employee ON calendar.bookings(gym_id, (data->>'employeeId'));
CREATE INDEX IF NOT EXISTS bookings_gym_client ON calendar.bookings(gym_id, (data->>'clientId'));

CREATE INDEX IF NOT EXISTS attendance_gym_employee ON calendar.attendance(gym_id, employee_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS attendance_open ON calendar.attendance(gym_id, employee_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS reminders_pending ON calendar.reminders(status,next_attempt_at);
`;

export const crmDatabaseOptimization = `
CREATE INDEX IF NOT EXISTS clients_gym_status ON "Client"("gymId", "status");
CREATE INDEX IF NOT EXISTS clients_gym_assigned ON "Client"("gymId", "assignedWorkerId");
CREATE INDEX IF NOT EXISTS clients_email ON "Client"(LOWER("email"));
CREATE INDEX IF NOT EXISTS clients_phone ON "Client"(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'));

CREATE INDEX IF NOT EXISTS packages_client ON "ClientServicePackage"("clientId");

CREATE INDEX IF NOT EXISTS training_plans_client ON "TrainingPlan"("clientId");
CREATE INDEX IF NOT EXISTS training_plans_status ON "TrainingPlan"("status");

-- Compresión de tablas grandes (PostgreSQL 12+)
ALTER TABLE "Client" SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE "Booking" SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE "ClientServicePackage" SET (autovacuum_vacuum_scale_factor = 0.05);
`;
