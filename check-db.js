require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkColumns() {
    console.log('Connecting with:', {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        ssl: process.env.DB_SSL
    });

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'csam_school',
        port: process.env.DB_PORT || 3306,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 20000
    });

    const [rows] = await connection.query(`SHOW COLUMNS FROM students`);
    console.log('Columns in students table:');
    rows.forEach(row => console.log(row.Field, row.Type));
    await connection.end();
}

checkColumns().catch(console.error);
