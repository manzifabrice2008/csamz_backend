require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function importSQL() {
    try {
        console.log('Connecting to database...');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || '165.22.210.122',
            user: process.env.DB_USER || 'avnadmin',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'defaultdb',
            port: process.env.DB_PORT || 13642,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
            multipleStatements: true,
            connectTimeout: 20000
        });

        console.log('✅ Connected to database');

        // Disable primary key requirement for this session
        console.log('Disabling sql_require_primary_key for this session...');
        await connection.query('SET SESSION sql_require_primary_key=0');
        await connection.query('SET FOREIGN_KEY_CHECKS=0');

        // Drop all existing tables
        console.log('Dropping existing tables...');
        const [tables] = await connection.query('SHOW TABLES');
        for (const table of tables) {
            const tableName = Object.values(table)[0];
            console.log(`  Dropping table: ${tableName}`);
            await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        }
        console.log('✅ All existing tables dropped');

        // Re-enable foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS=1');

        // Read the SQL file
        const sqlFilePath = path.join(__dirname, '..', 'csam_school.sql');
        console.log(`Reading SQL file: ${sqlFilePath}`);
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        console.log('Executing SQL import...');
        await connection.query(sqlContent);

        console.log('✅ SQL import completed successfully!');
        await connection.end();
    } catch (error) {
        console.error('❌ Error during import:', error.message);
        process.exit(1);
    }
}

importSQL();
