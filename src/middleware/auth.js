const { supabase } = require('../services/supabase');

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Access token is missing or invalid.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired access token.',
      });
    }

    // Attach user object to the request
    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication verification failed:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Authentication check failed.',
    });
  }
};

module.exports = { requireAuth };
