# Planificación deportiva / Rutina

## Para el entrenador

1. Abre la ficha de un cliente asignado o con una cita contigo.
2. En **Planificación deportiva / Rutina**, pulsa **Crear nuevo plan**.
3. Indica nombre, objetivo, fecha de inicio y, si corresponde, fecha de fin.
4. Añade cada día de entrenamiento y selecciona su día de la semana. Puedes añadir varios bloques el mismo día.
5. En cada día añade ejercicios: nombre, series, repeticiones o tiempo, descanso, carga sugerida y observaciones técnicas.
6. Guarda como **Activo** para utilizarlo, o **Borrador** para prepararlo. Activar otro plan archiva el anterior, que sigue disponible para consulta y edición. También puedes marcar un plan como completado o archivarlo.
7. Desde una cita del calendario pulsa **Ver planning de hoy**. Se abre dentro del calendario y utiliza la **fecha de la cita**, aunque sea futura. Solo muestra como rutina de ese día las sesiones del plan activo dentro de sus fechas de vigencia. Se puede desplegar el plan semanal completo como referencia.

Si no hay plan activo o no hay rutina ese día, se muestra un mensaje; no se inventa una rutina ni se consume ninguna sesión. La distribución es semanal por días explícitos, no una rotación automática según asistencia.

## Permisos y almacenamiento

- Administración puede crear y editar planes del centro seleccionado.
- El entrenador solo puede consultar y editar los de clientes vinculados a él mediante asignación o una reserva no cancelada.
- Recepción puede consultar; no editar.
- El acceso de clientes a gestión continúa bloqueado.
- Se utiliza el modelo Prisma existente `TrainingPlan`. Los días y ejercicios se guardan en `details` con una versión de estructura. No se necesita migración ni proveedor externo.
- Se conserva el autor Prisma cuando la cuenta tiene correspondencia en `User`; el último editor autenticado se registra también en los detalles del plan.
- Un bloqueo por cliente evita dos planes activos al guardar simultáneamente. Las ediciones comprueban la versión guardada y rechazan sobrescribir cambios de otro usuario. En ese caso, cierra el editor, pulsa **Actualizar rutinas** y vuelve a abrirlo.
- Las rutinas no crean reservas, no modifican bonos y no registran cobros.

## Código

- `src/training/plans.ts`: validación, permisos, persistencia y selección por fecha.
- `src/routes/training-plans.ts`: consulta y guardado autenticados.
- `web/shared/training-plans.js` y `.css`: editor y consulta reutilizados por ficha y calendario.
- `tests/training-plans.test.cjs`: persistencia, concurrencia, permisos, fechas e interfaz.
