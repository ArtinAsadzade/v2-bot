declare module 'decimal.js' {
  export default class Decimal {
    public static ROUND_HALF_UP: number;
    public static ROUND_FLOOR: number;
    public static ROUND_UP: number;
    public static set(config: Record<string, unknown>): void;
    public constructor(value: string | number | bigint | Decimal);
    public isInteger(): boolean;
    public toString(): string;
    public toFixed(decimalPlaces?: number): string;
    public plus(value: string | number | bigint | Decimal): Decimal;
    public minus(value: string | number | bigint | Decimal): Decimal;
    public mul(value: string | number | bigint | Decimal): Decimal;
    public div(value: string | number | bigint | Decimal): Decimal;
    public toDecimalPlaces(decimalPlaces: number, rounding?: number): Decimal;
  }
}
