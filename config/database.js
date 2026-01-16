const { supabase } = require('./supabase');

// For consistency across routes that use: const { supabase } = require('../config/database')
module.exports = { supabase };
