// Validates req[source] against a zod schema; responds 400 with field-level messages on failure.
function toFieldErrors(issues) {
  const fields = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return res.status(400).json({ error: 'Please check the highlighted fields.', fields: toFieldErrors(result.error.issues) });
  }
  req.valid = result.data;
  next();
};

module.exports = { validate, toFieldErrors };
