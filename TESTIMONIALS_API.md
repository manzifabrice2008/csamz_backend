# Testimonials API Documentation

## Overview
API endpoints for managing student testimonials at CSAM Zaccaria TSS.

## Base URL
```
http://localhost:5000/api/testimonials
```

## Public Endpoints (No Authentication Required)

### 1. Get All Approved Testimonials
Get all testimonials that have been approved by admin.

**Endpoint:** `GET /approved`

**Response:**
```json
[
  {
    "id": 1,
    "full_name": "John Doe",
    "program": "Software Development",
    "graduation_year": "2024",
    "rating": 5,
    "testimonial_text": "Great experience at CSAM!",
    "profile_image": "https://example.com/image.jpg",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
]
```

### 2. Submit New Testimonial
Submit a new testimonial for review.

**Endpoint:** `POST /submit`

**Request Body:**
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "phone_number": "+250788123456",
  "program": "Software Development",
  "graduation_year": "2024",
  "rating": 5,
  "testimonial_text": "My experience at CSAM was amazing...",
  "profile_image": "https://example.com/image.jpg"
}
```

**Required Fields:**
- full_name
- email
- program
- rating (1-5)
- testimonial_text

**Response:**
```json
{
  "message": "Testimonial submitted successfully! It will be reviewed by our admin team.",
  "testimonial_id": 1
}
```

## Admin Endpoints (Authentication Required)

### 3. Get All Testimonials
Get all testimonials regardless of status.

**Endpoint:** `GET /all`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": 1,
    "full_name": "John Doe",
    "email": "john@example.com",
    "phone_number": "+250788123456",
    "program": "Software Development",
    "graduation_year": "2024",
    "rating": 5,
    "testimonial_text": "Great experience!",
    "profile_image": null,
    "status": "pending",
    "admin_notes": null,
    "approved_by": null,
    "approved_by_name": null,
    "approved_at": null,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
]
```

### 4. Get Testimonials by Status
Get testimonials filtered by status.

**Endpoint:** `GET /status/:status`

**Parameters:**
- status: `pending` | `approved` | `rejected`

**Headers:**
```
Authorization: Bearer <token>
```

### 5. Get Single Testimonial
Get details of a specific testimonial.

**Endpoint:** `GET /:id`

**Headers:**
```
Authorization: Bearer <token>
```

### 6. Approve Testimonial
Approve a pending testimonial.

**Endpoint:** `PUT /:id/approve`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "admin_notes": "Approved - great testimonial"
}
```

**Response:**
```json
{
  "message": "Testimonial approved successfully"
}
```

### 7. Reject Testimonial
Reject a pending testimonial.

**Endpoint:** `PUT /:id/reject`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "admin_notes": "Rejected - inappropriate content"
}
```

**Response:**
```json
{
  "message": "Testimonial rejected"
}
```

### 8. Delete Testimonial
Permanently delete a testimonial.

**Endpoint:** `DELETE /:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Testimonial deleted successfully"
}
```

### 9. Get Testimonial Statistics
Get overview statistics of all testimonials.

**Endpoint:** `GET /stats/overview`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total": 50,
  "pending": 10,
  "approved": 35,
  "rejected": 5,
  "average_rating": 4.7
}
```

## Database Schema

```sql
CREATE TABLE testimonials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  program VARCHAR(100) NOT NULL,
  graduation_year VARCHAR(4),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  testimonial_text TEXT NOT NULL,
  profile_image VARCHAR(500),
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  admin_notes TEXT,
  approved_by INT,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (approved_by) REFERENCES admins(id) ON DELETE SET NULL
);
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Please provide all required fields"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "error": "Testimonial not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to fetch testimonials"
}
```

## Frontend Routes

### Public Routes
- `/testimonial/submit` - Form to submit testimonial

### Admin Routes (Protected)
- `/admin/testimonials` - Manage all testimonials

## Usage Example

### Submit Testimonial (JavaScript)
```javascript
const submitTestimonial = async (data) => {
  const response = await fetch('http://localhost:5000/api/testimonials/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  return await response.json();
};
```

### Approve Testimonial (Admin)
```javascript
const approveTestimonial = async (id, notes) => {
  const token = localStorage.getItem('authToken');
  const response = await fetch(`http://localhost:5000/api/testimonials/${id}/approve`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ admin_notes: notes }),
  });
  
  return await response.json();
};
```

## Testing

1. **Setup Database:**
   ```bash
   mysql -u root -p < backend/config/database.sql
   ```

2. **Start Backend:**
   ```bash
   cd backend
   npm start
   ```

3. **Test Public Endpoint:**
   ```bash
   curl http://localhost:5000/api/testimonials/approved
   ```

4. **Submit Test Testimonial:**
   ```bash
   curl -X POST http://localhost:5000/api/testimonials/submit \
     -H "Content-Type: application/json" \
     -d '{
       "full_name": "Test User",
       "email": "test@example.com",
       "program": "Software Development",
       "rating": 5,
       "testimonial_text": "Great school!"
     }'
   ```
