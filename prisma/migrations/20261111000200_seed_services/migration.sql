INSERT INTO "Service" (
  "id",
  "name",
  "description",
  "modality",
  "type",
  "trainingCount",
  "price",
  "durationMin",
  "validityWeeks",
  "recommendedWeeklyFrequency",
  "conditions",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT v."id"::uuid, v."name", v."description", v."modality"::"ServiceModality", v."type"::"ServiceType", v."trainingCount", v."price", v."durationMin", v."validityWeeks", v."recommendedWeeklyFrequency", v."conditions", true, now(), now()
FROM (
  VALUES
    ('a1000001-0000-4000-8000-000000000001', 'Pack 4 Entrenos Individual', 'Entrenamiento personal exclusivo (4 sesiones de 1 hora). Incluye pautas nutricionales, rutina de ejercicios y asesoría corporal.', 'INDIVIDUAL', 'PACK', 4, 150.00, 60, 4, 1, 'Validez de 4 semanas (1 día/semana). Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.'),
    ('a1000001-0000-4000-8000-000000000002', 'Pack 8 Entrenos Individual', 'Entrenamiento personal exclusivo (8 sesiones de 1 hora, más vendido). Incluye pautas nutricionales, rutina de ejercicios y asesoría corporal.', 'INDIVIDUAL', 'PACK', 8, 290.00, 60, 4, 2, 'Validez de 4 semanas (2 días/semana). Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.'),
    ('a1000001-0000-4000-8000-000000000003', 'Pack 12 Entrenos Individual', 'Entrenamiento personal exclusivo (12 sesiones de 1 hora). Incluye pautas nutricionales, rutina de ejercicios y asesoría corporal.', 'INDIVIDUAL', 'PACK', 12, 430.00, 60, 4, 3, 'Validez de 4 semanas (3 días/semana). Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.'),
    ('a1000001-0000-4000-8000-000000000004', 'Entreno Personal 1h Individual', 'Sesión única de entrenamiento personal exclusivo (1 hora).', 'INDIVIDUAL', 'SESION_INDIVIDUAL', 1, 39.00, 60, 4, NULL, 'Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.'),
    ('a1000001-0000-4000-8000-000000000005', 'Pack 4 Entrenos Dual', 'Entrenamiento personal en pareja (4 sesiones de 1 hora). Incluye pautas nutricionales, rutina de ejercicios y asesoría corporal.', 'DUAL', 'PACK', 4, 95.00, 60, 4, 1, 'Validez de 4 semanas (1 día/semana). Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.'),
    ('a1000001-0000-4000-8000-000000000006', 'Pack 8 Entrenos Dual', 'Entrenamiento personal en pareja (8 sesiones de 1 hora, más vendido). Incluye pautas nutricionales, rutina de ejercicios y asesoría corporal.', 'DUAL', 'PACK', 8, 149.00, 60, 4, 2, 'Validez de 4 semanas (2 días/semana). Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.'),
    ('a1000001-0000-4000-8000-000000000007', 'Pack 12 Entrenos Dual', 'Entrenamiento personal en pareja (12 sesiones de 1 hora). Incluye pautas nutricionales, rutina de ejercicios y asesoría corporal.', 'DUAL', 'PACK', 12, 215.00, 60, 4, 3, 'Validez de 4 semanas (3 días/semana). Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.'),
    ('a1000001-0000-4000-8000-000000000008', 'Entreno Personal 1h Dual', 'Sesión única de entrenamiento personal en pareja (1 hora).', 'DUAL', 'SESION_INDIVIDUAL', 1, 25.00, 60, 4, NULL, 'Cambios de hora o día con mínimo 2 horas de antelación dentro del horario del centro.')
) AS v("id", "name", "description", "modality", "type", "trainingCount", "price", "durationMin", "validityWeeks", "recommendedWeeklyFrequency", "conditions")
WHERE NOT EXISTS (
  SELECT 1 FROM "Service" s WHERE s."id" = v."id"::uuid OR lower(s."name") = lower(v."name")
);
