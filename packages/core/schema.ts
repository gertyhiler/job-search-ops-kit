function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function typeMatches(expected: string, value: unknown): boolean {
  if (expected === "null") {
    return value === null;
  }

  if (expected === "array") {
    return Array.isArray(value);
  }

  if (expected === "object") {
    return isPlainObject(value);
  }

  return typeof value === expected;
}

function validateFormat(format: string, value: unknown, at: string, errors: string[]): void {
  if (typeof value !== "string") {
    return;
  }

  if (format === "date-time" && Number.isNaN(Date.parse(value))) {
    errors.push(`${at} must be a valid date-time string`);
  }

  if (format === "uri") {
    try {
      // eslint-disable-next-line no-new
      new URL(value);
    } catch {
      errors.push(`${at} must be a valid URI`);
    }
  }
}

function validateNode(schema: any, value: unknown, at: string, errors: string[]): void {
  const expectedTypes = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : null;
  if (expectedTypes && !expectedTypes.some((expected: string) => typeMatches(expected, value))) {
    errors.push(`${at} must be of type ${expectedTypes.join(" | ")}`);
    return;
  }

  if (schema.enum && !schema.enum.some((item: unknown) => valuesEqual(item, value))) {
    errors.push(`${at} must be one of ${schema.enum.map((item: unknown) => JSON.stringify(item)).join(", ")}`);
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${at} must be >= ${schema.minimum}`);
    }

    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${at} must be <= ${schema.maximum}`);
    }
  }

  if (schema.format) {
    validateFormat(schema.format, value, at, errors);
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateNode(schema.items, item, `${at}[${index}]`, errors));
  }

  if (isPlainObject(value)) {
    const properties = schema.properties ?? {};

    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        errors.push(`${at}.${requiredKey} is required`);
      }
    }

    for (const [key, child] of Object.entries(properties)) {
      if (key in value) {
        validateNode(child, value[key], `${at}.${key}`, errors);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${at}.${key} is not allowed`);
        }
      }
    }
  }
}

export function validateAgainstSchema(schema: any, value: unknown): string[] {
  const errors: string[] = [];
  validateNode(schema, value, "$", errors);
  return errors;
}

export function assertValidAgainstSchema(schema: any, value: unknown, label = "payload"): void {
  const errors = validateAgainstSchema(schema, value);
  if (errors.length > 0) {
    throw new Error(`Invalid ${label}: ${errors.join("; ")}`);
  }
}
