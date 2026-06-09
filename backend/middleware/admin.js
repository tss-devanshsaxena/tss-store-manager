const ADMIN_EMAIL = (process.env.STORE_ADMIN_EMAIL || 'devansh.saxena@thesouledstore.com').toLowerCase();

function isStoreAdmin(email) {
  return String(email || '').toLowerCase().trim() === ADMIN_EMAIL;
}

function adminMiddleware(req, res, next) {
  if (!req.user?.email || !isStoreAdmin(req.user.email)) {
    return res.status(403).json({
      error: 'You do not have access to perform this action. Contact devansh.saxena@thesouledstore.com.',
      contact: 'devansh.saxena@thesouledstore.com',
    });
  }
  next();
}

module.exports = { adminMiddleware, isStoreAdmin, ADMIN_EMAIL };
