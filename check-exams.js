require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkExams() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'csam_school'
    });

    // Check table structure
    const [columns] = await connection.query(`SHOW COLUMNS FROM online_exams`);
    console.log('Columns:', columns.map(c => c.Field));

    // Check for any exams
    const [exams] = await connection.query(`SELECT * FROM online_exams`);
    console.log('Total Exams:', exams.length);
    if (exams.length > 0) {
        console.log('First Exam:', exams[0]);
    }

    // Check the teacher-specific query logic if possible (guessing teacher ID 1 or getting all teachers)
    const [teachers] = await connection.query('SELECT id, full_name, trade FROM teachers LIMIT 1');
    if (teachers.length > 0) {
        const teacher = teachers[0];
        console.log(`Checking exams for teacher ${teacher.full_name} (${teacher.id}) with trade '${teacher.trade}'`);

        // Simulate the query from exams.js
        const [filtered] = await connection.query('SELECT * FROM online_exams WHERE teacher_id = ?', [teacher.id]);
        console.log('Exams by teacher_id:', filtered.length);
    }

    await connection.end();
}

checkExams().catch(console.error);
