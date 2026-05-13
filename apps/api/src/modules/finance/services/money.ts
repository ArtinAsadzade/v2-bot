import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });

export type TomanAmount = bigint;

const integerPattern = /^-?\d+$/u;

export const toman = (value: string | number | bigint | Decimal): TomanAmount => {
  const decimal = new Decimal(value.toString());
  if (!decimal.isInteger()) throw new Error('Toman amount must be an integer');
  return BigInt(decimal.toFixed(0));
};

export const assertPositiveToman = (amount: TomanAmount): void => {
  if (amount <= 0n) throw new Error('Amount must be greater than zero');
};

export const parseTomanInput = (value: string): TomanAmount => {
  if (!integerPattern.test(value)) throw new Error('Invalid Toman amount');
  return toman(value);
};

export const addToman = (left: TomanAmount, right: TomanAmount): TomanAmount =>
  toman(new Decimal(left.toString()).plus(right.toString()));

export const subtractToman = (left: TomanAmount, right: TomanAmount): TomanAmount =>
  toman(new Decimal(left.toString()).minus(right.toString()));

export const multiplyByBps = (amount: TomanAmount, bps: number): TomanAmount =>
  toman(
    new Decimal(amount.toString()).mul(bps).div(10_000).toDecimalPlaces(0, Decimal.ROUND_FLOOR),
  );

export const minToman = (...amounts: TomanAmount[]): TomanAmount =>
  amounts.reduce((min, amount) => (amount < min ? amount : min));

export const tomanToString = (amount: TomanAmount): string => amount.toString();
