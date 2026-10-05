import { ValidateBy, ValidationOptions } from 'class-validator';
import { weightUnits } from './weight-units';

/** Accepts only units from the registry; the message lists what is supported (E1). */
export function IsWeightUnit(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isWeightUnit',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && weightUnits.isSupported(value),
        defaultMessage: (args) =>
          `Unit '${String(args?.value)}' is not supported. Supported: ${weightUnits.codes().join(', ')}`,
      },
    },
    { ...options, context: { code: 'UNSUPPORTED_UNIT' } },
  );
}
