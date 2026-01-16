# CSAM Zaccaria TVET Backend API

Backend API for CSAM Zaccaria TVET School website with MySQL database.

## Features

- ✅ Admin authentication (Register/Login)
- ✅ JWT token-based authorization
- ✅ News articles CRUD operations
- ✅ MySQL database integration
- ✅ Password hashing with bcrypt
- ✅ Input validation
- ✅ CORS enabled

## Prerequisites

- Node.js (v14 or higher)
- MySQL Server (v5.7 or higher)
- npm or yarn

## Installation

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Setup MySQL Database

1. Open MySQL Workbench or command line
2. Run the SQL script to create database and tables:

```bash
mysql -u root -p < config/database.sql
```

Or manually execute the SQL commands in `config/database.sql`

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`:

```bash
copy .env.example .env
```

2. Edit `.env` file with your MySQL credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=csam_school
JWT_SECRET=your_super_secret_jwt_key_change_this
PORT=5000
```

### 4. Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication

#### Register Admin
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "admin",
  "email": "admin@csam.edu",
  "password": "password123",
  "full_name": "Admin Name",
  "role": "admin"
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@csam.edu",
  "password": "password123"
}
```

#### Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>
```

### News Articles

#### Get All Articles (Public)
```
GET /api/news
```

#### Get Single Article (Public)
```
GET /api/news/:id
```

#### Create Article (Protected)
```
POST /api/news
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Article Title",
  "excerpt": "Short description",
  "content": "Full article content",
  "category": "Achievements",
  "image_url": "https://example.com/image.jpg",
  "published_date": "2024-03-15"
}
```

#### Update Article (Protected)
```
PUT /api/news/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "excerpt": "Updated excerpt"
}
```

#### Delete Article (Protected)
```
DELETE /api/news/:id
Authorization: Bearer <token>
```

### Health Check
```
GET /api/health
```

## Database Schema

### admins table
- id (INT, PRIMARY KEY, AUTO_INCREMENT)
- username (VARCHAR(50), UNIQUE)
- email (VARCHAR(100), UNIQUE)
- password (VARCHAR(255), hashed)
- full_name (VARCHAR(100))
- role (ENUM: 'super_admin', 'admin')
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

### news_articles table
- id (INT, PRIMARY KEY, AUTO_INCREMENT)
- title (VARCHAR(255))
- excerpt (TEXT)
- content (TEXT)
- category (VARCHAR(50))
- image_url (VARCHAR(500))
- author_id (INT, FOREIGN KEY)
- published_date (DATE)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

## Default Admin Account

After running the database setup script, a default admin account is created:

- **Email**: admin@csam.edu
- **Password**: admin123

⚠️ **Important**: Change this password immediately in production!

## Security Notes

1. Always use strong JWT_SECRET in production
2. Change default admin password
3. Use HTTPS in production
4. Keep dependencies updated
5. Implement rate limiting for production

## Troubleshooting

### MySQL Connection Error
- Check if MySQL server is running
- Verify credentials in `.env` file
- Ensure database exists

### Port Already in Use
- Change PORT in `.env` file
- Or stop the process using port 5000

### JWT Token Invalid
- Check if JWT_SECRET matches between requests
- Ensure token is not expired (7 days validity)

## Project Structure

```
backend/
├── config/
│   ├── database.js       # MySQL connection
│   └── database.sql      # Database schema
├── middleware/
│   └── auth.js          # JWT authentication
├── routes/
│   ├── auth.js          # Authentication routes
│   └── news.js          # News CRUD routes
├── .env.example         # Environment template
├── package.json         # Dependencies
├── server.js           # Main server file
└── README.md           # This file
```

## Support

For issues or questions, contact the development team.
# csamz_backend
