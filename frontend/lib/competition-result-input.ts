export function maskResultInput(value: string, kind: string): string {
  if (kind === 'reps') return value.replace(/\D/g, '');
  if (kind !== 'time') return value;
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

export function validResultTime(value: string): boolean {
  return /^\d{2,}:[0-5]\d$/.test(value);
}
