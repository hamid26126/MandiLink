import { ApiError } from '../utils/ApiError.js';

/**
 * Validates request data against zod schemas before it reaches a controller.
 *
 * Usage:
 *   validate({ body: registerSchema })
 *   validate({ query: listListingsQuerySchema, params: idParamSchema })
 *
 * Parsed values replace the raw input, so controllers receive clean, coerced
 * data (for example page: "2" becomes page: 2).
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      for (const source of ['params', 'query', 'body']) {
        if (!schemas[source]) continue;

        const result = schemas[source].safeParse(req[source]);
        if (!result.success) {
          const details = result.error.issues.map((issue) => ({
            field: issue.path.join('.') || source,
            message: issue.message,
          }));
          throw ApiError.badRequest('Validation failed', details);
        }

        req[source] = result.data;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
