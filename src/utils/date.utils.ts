export function parseDateForPrisma(input: unknown): Date | undefined {
  if (input === null || input === undefined || input === '') return undefined;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new Error('Fecha inválida');
    }
    return input;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return undefined;

    // HTML date input: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) throw new Error('Fecha inválida');
      return d;
    }

    // ISO datetime or other parseable formats
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) throw new Error('Fecha inválida');
    return d;
  }

  throw new Error('Fecha inválida');
}
