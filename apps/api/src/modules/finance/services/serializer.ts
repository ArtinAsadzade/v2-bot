export const serializeFinancial = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, current) => {
      if (typeof current === 'bigint') return current.toString();
      if (current instanceof Date) return current.toISOString();
      return current;
    }),
  ) as T;
