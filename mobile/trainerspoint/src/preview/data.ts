// Fictional data. This preview never connects to the gym database or payment providers.
export type Session = { id: string; date: Date; title: string; trainer: string; time: string; duration: string; center: string; address: string };
export function createSessions(): Session[] {
  return [1, 3, 5].map((offset, index) => {
    const date = new Date(); date.setDate(date.getDate() + offset); date.setHours(18, 0, 0, 0);
    return { id: `demo-${index}`, date, title: index === 1 ? 'Entrenamiento DUAL' : 'Entrenamiento personal', trainer: index === 1 ? 'Marcos' : 'Laura', time: '18:00', duration: '60 min', center: 'Trainers Point · Bizkaia', address: 'Centro de ejemplo · Consulta en recepción la dirección real' };
  });
}
export const shortDate = (date: Date) => date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
export const longDate = (date: Date) => date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
