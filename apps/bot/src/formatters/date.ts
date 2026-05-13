export const formatPersianDate = (value: string | Date): string =>
  new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium' }).format(new Date(value));

export const formatToman = (value: number | bigint): string => `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;
