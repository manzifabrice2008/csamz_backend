const { supabase } = require('../config/database');
require('dotenv').config();

async function checkTable() {
    console.log('🔍 Checking for site_analytics table...');
    const { data, error } = await supabase
        .from('site_analytics')
        .select('*')
        .limit(1);

    if (error) {
        if (error.code === '42P01') {
            console.error('❌ Table "site_analytics" does NOT exist.');
            console.log('\nTo fix this:');
            console.log('1. Go to https://supabase.com and open your project.');
            console.log('2. Go to the "SQL Editor" tab.');
            console.log('3. Copy everything from: backend/config/analytics-migration.sql');
            console.log('4. Paste it into the SQL Editor and click "Run".');
        } else {
            console.error('❌ Error checking table:', error.message);
        }
    } else {
        console.log('✅ Table "site_analytics" exists and is accessible!');
    }
}

checkTable();
