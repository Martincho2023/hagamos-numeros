// Genera (una sola vez) y persiste un identificador único por dispositivo.
// Se usa para saber qué juntadas le pertenecen a "este usuario" sin depender
// del nombre que escribió, ya que dos personas distintas pueden poner el
// mismo nombre.
export function getDeviceId(): string {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
  }
  return id;
}
