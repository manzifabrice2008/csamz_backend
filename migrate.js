const fs = require('fs');
const path = require('path');
const db = require('./config/database');

const MIGRATIONS_TABLE = '_migrations';
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++; // skip '/'
      }
      continue;
    }

    // start comments
    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '-' && next === '-') {
        inLineComment = true;
        i++; // skip second '-'
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++; // skip '*'
        continue;
      }
    }

    // string toggles
    if (!inDouble && !inBacktick && ch === "'" && sql[i - 1] !== '\\') inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"' && sql[i - 1] !== '\\') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`' && sql[i - 1] !== '\\') inBacktick = !inBacktick;

    if (!inSingle && !inDouble && !inBacktick && ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function getAppliedMigrations() {
  const [rows] = await db.query(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY applied_at ASC`);
  return new Set(rows.map((r) => r.name));
}

async function applyMigrationFile(filePath, fileName) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = splitSqlStatements(sql);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    for (const stmt of statements) {
      if (!stmt) continue;
      
      try {
        await conn.query(stmt);
      } catch (err) {
        // If it's a duplicate column/table error, log and continue
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR' || 
            err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
          console.log(`ℹ️  Skipping (already applied): ${fileName} - ${err.message.split('\n')[0]}`);
        } else {
          throw err; // Re-throw other errors
        }
      }
    }
    
    // Mark as applied even if some statements were skipped
    await conn.query('INSERT IGNORE INTO ' + MIGRATIONS_TABLE + ' (name) VALUES (?)', [fileName]);
    await conn.commit();
    console.log('✅ Processed migration:', fileName);
    return true;
  } catch (err) {
    await conn.rollback();
    console.error('❌ Failed migration:', fileName, '\nError:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found, skipping.');
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const full = path.join(MIGRATIONS_DIR, file);
    await applyMigrationFile(full, file);
  }

  console.log('📦 Migrations complete');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigrations };
