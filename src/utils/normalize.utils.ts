export function normalizeOrganizacionSucursalId(id: number): number {
  // Frontend legacy: usa offset +10000 para diferenciar tipos.
  return id >= 10000 ? id - 10000 : id;
}
