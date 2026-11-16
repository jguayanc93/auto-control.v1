// Valida body / query / params con esquemas Zod.
// El resultado validado (ya limpio y convertido) queda en req.valid.body / .query / .params.
import { badRequest } from '../lib/errors.js';

const PARTS = ['body', 'query', 'params'];

/** @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas */
export function validate(schemas) {
  return (req, res, next) => {
    req.valid ??= {};
    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        const fields = {};
        for (const issue of result.error.issues) {
          const key = issue.path.join('.') || part;
          fields[key] ??= issue.message;
        }
        throw badRequest('Revisa los datos ingresados', { fields });
      }
      req.valid[part] = result.data;
    }
    next();
  };
}
