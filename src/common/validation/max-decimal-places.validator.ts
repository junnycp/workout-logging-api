import { ValidateBy, ValidationOptions } from 'class-validator';
import Decimal from 'decimal.js';

/**
 * Limits the scale of a numeric field. Replaces class-validator's `maxDecimalPlaces`, which counts digits
 * after the "." in `toString()` and throws for exponent forms such as 1e-7 (turning a bad request into a 500).
 * decimal.js reads every JS number exactly as JSON delivered it. Non-numbers are left to `@IsNumber()`.
 */
export function MaxDecimalPlaces(places: number, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxDecimalPlaces',
      constraints: [places],
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'number' ||
          (Number.isFinite(value) && new Decimal(value).decimalPlaces() <= places),
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must have at most ${places} decimal places`,
      },
    },
    options,
  );
}
