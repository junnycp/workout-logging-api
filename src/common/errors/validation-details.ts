import type { ValidationError } from 'class-validator';
import type { ErrorDetail } from './error-codes';
import { DetailCode } from './error-codes';

const CONSTRAINT_CODE_OVERRIDES: Record<string, string> = {
  whitelistValidation: DetailCode.UNKNOWN_FIELD,
};

const toUpperSnake = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const childPath = (parent: string, property: string): string => {
  if (/^\d+$/.test(property)) return `${parent}[${property}]`;
  return parent ? `${parent}.${property}` : property;
};

/**
 * Flattens class-validator's nested errors into one detail per failed constraint.
 * A validator can choose its public code with `{ context: { code: 'UNSUPPORTED_UNIT' } }`;
 * otherwise the constraint name is used in UPPER_SNAKE_CASE (`isInt` -> `IS_INT`).
 */
export function toErrorDetails(errors: ValidationError[], parentPath = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const path = childPath(parentPath, error.property);
    const own = Object.entries(error.constraints ?? {}).map(([constraint, message]) => {
      const contextCode = (error.contexts?.[constraint] as { code?: unknown } | undefined)?.code;
      return {
        path,
        code:
          typeof contextCode === 'string'
            ? contextCode
            : (CONSTRAINT_CODE_OVERRIDES[constraint] ?? toUpperSnake(constraint)),
        message,
      };
    });
    return [...own, ...toErrorDetails(error.children ?? [], path)];
  });
}
