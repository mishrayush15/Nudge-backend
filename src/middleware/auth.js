const { supabase } = require('../services/supabase');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

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

    // Create request-scoped Supabase client that inherits user's JWT
    if (process.env.NODE_ENV === 'test') {
      req.supabase = supabase;
    } else {
      req.supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });
    }

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
