function authMiddleware(req, res, next) {
  const token = process.env.AUTH_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: 'AUTH_TOKEN is not configured',
    });
  }

  const header = req.headers.authorization || '';
  const [scheme, value] = header.split(' ');

  if (scheme !== 'Bearer' || value !== token) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  return next();
}

module.exports = authMiddleware;
