const fallbackIssueCode = { custom: 'custom' };

class SimpleZodError extends Error {
  constructor(issues) {
    super('Validation error');
    this.name = 'ZodError';
    this.issues = issues;
  }
}

class BaseSchema {
  constructor() {
    this._optional = false;
    this._nullable = false;
    this._hasDefault = false;
    this._defaultValue = undefined;
    this._refinements = [];
    this._superRefinements = [];
  }

  optional() {
    this._optional = true;
    return this;
  }

  nullable() {
    this._nullable = true;
    return this;
  }

  default(value) {
    this._hasDefault = true;
    this._defaultValue = value;
    return this;
  }

  refine(check, options = {}) {
    this._refinements.push({ check, options });
    return this;
  }

  superRefine(check) {
    this._superRefinements.push(check);
    return this;
  }

  parse(value, path = []) {
    let current = value;
    if (current === undefined) {
      if (this._hasDefault) {
        current = typeof this._defaultValue === 'function' ? this._defaultValue() : this._defaultValue;
      } else if (this._optional) {
        return undefined;
      } else {
        throw new SimpleZodError([{ path, message: 'Required value', code: 'invalid_type' }]);
      }
    }

    if (current === null) {
      if (this._nullable) {
        return null;
      }
      throw new SimpleZodError([{ path, message: 'Expected non-null value', code: 'invalid_type' }]);
    }

    const parsed = this._parseImpl(current, path);
    const refineIssues = [];
    for (const { check, options } of this._refinements) {
      let ok = false;
      try {
        ok = Boolean(check(parsed));
      } catch (err) {
        ok = false;
      }
      if (!ok) {
        refineIssues.push({
          path: options?.path ?? path,
          message: options?.message ?? 'Invalid value',
          code: options?.code ?? fallbackIssueCode.custom,
        });
      }
    }

    if (this._superRefinements.length) {
      const ctx = {
        addIssue: (issue = {}) => {
          refineIssues.push({
            path: issue.path ?? path,
            message: issue.message ?? 'Invalid value',
            code: issue.code ?? fallbackIssueCode.custom,
          });
        },
      };
      for (const fn of this._superRefinements) {
        fn(parsed, ctx);
      }
    }

    if (refineIssues.length) {
      throw new SimpleZodError(refineIssues);
    }

    return parsed;
  }

  safeParse(value) {
    try {
      const data = this.parse(value);
      return { success: true, data };
    } catch (err) {
      if (err instanceof SimpleZodError) {
        return { success: false, error: err };
      }
      throw err;
    }
  }
}

class StringSchema extends BaseSchema {
  constructor() {
    super();
    this._checks = [];
  }

  min(length, message) {
    this._checks.push({ type: 'min', value: length, message });
    return this;
  }

  url(message) {
    this._checks.push({ type: 'url', message });
    return this;
  }

  _parseImpl(value, path) {
    if (typeof value !== 'string') {
      throw new SimpleZodError([{ path, message: 'Expected string', code: 'invalid_type' }]);
    }
    const issues = [];
    for (const check of this._checks) {
      if (check.type === 'min' && value.length < check.value) {
        issues.push({ path, message: check.message ?? `String must contain at least ${check.value} character(s)`, code: 'too_small' });
      }
      if (check.type === 'url') {
        try {
          new URL(value);
        } catch (err) {
          issues.push({ path, message: check.message ?? 'Invalid URL', code: 'invalid_string' });
        }
      }
    }
    if (issues.length) {
      throw new SimpleZodError(issues);
    }
    return value;
  }
}

class NumberSchema extends BaseSchema {
  constructor({ coerce = false } = {}) {
    super();
    this._coerce = coerce;
    this._checks = [];
  }

  int() {
    this._checks.push({ type: 'int' });
    return this;
  }

  positive() {
    this._checks.push({ type: 'positive' });
    return this;
  }

  min(value, message) {
    this._checks.push({ type: 'min', value, message });
    return this;
  }

  max(value, message) {
    this._checks.push({ type: 'max', value, message });
    return this;
  }

  _parseImpl(value, path) {
    let num = value;
    if (this._coerce) {
      num = Number(value);
    }
    if (typeof num !== 'number' || Number.isNaN(num)) {
      throw new SimpleZodError([{ path, message: 'Expected number', code: 'invalid_type' }]);
    }
    const issues = [];
    for (const check of this._checks) {
      if (check.type === 'int' && !Number.isInteger(num)) {
        issues.push({ path, message: 'Expected integer', code: 'invalid_type' });
      }
      if (check.type === 'positive' && !(num > 0)) {
        issues.push({ path, message: 'Expected positive number', code: 'too_small' });
      }
      if (check.type === 'min' && num < check.value) {
        issues.push({ path, message: check.message ?? `Expected number >= ${check.value}`, code: 'too_small' });
      }
      if (check.type === 'max' && num > check.value) {
        issues.push({ path, message: check.message ?? `Expected number <= ${check.value}`, code: 'too_big' });
      }
    }
    if (issues.length) {
      throw new SimpleZodError(issues);
    }
    return num;
  }
}

class ObjectSchema extends BaseSchema {
  constructor(shape) {
    super();
    this._shape = shape;
  }

  _parseImpl(value, path) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SimpleZodError([{ path, message: 'Expected object', code: 'invalid_type' }]);
    }
    const result = {};
    const issues = [];
    for (const key of Object.keys(this._shape)) {
      const schema = this._shape[key];
      try {
        const parsedValue = schema.parse(value[key], [...path, key]);
        if (parsedValue !== undefined || Object.hasOwn(value, key)) {
          result[key] = parsedValue;
        }
      } catch (err) {
        if (err instanceof SimpleZodError) {
          issues.push(...err.issues);
        } else {
          throw err;
        }
      }
    }
    if (issues.length) {
      throw new SimpleZodError(issues);
    }
    return result;
  }
}

const fallbackZ = {
  object: (shape) => new ObjectSchema(shape),
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  coerce: {
    number: () => new NumberSchema({ coerce: true }),
  },
  ZodIssueCode: fallbackIssueCode,
};

let z;
try {
  ({ z } = await import('zod'));
} catch (err) {
  z = fallbackZ;
}

if (!z.ZodIssueCode) {
  z.ZodIssueCode = fallbackIssueCode;
}

export { z, SimpleZodError as ZodError };
