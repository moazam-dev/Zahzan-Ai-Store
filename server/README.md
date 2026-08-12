# ZAHZAN E-Commerce Backend Foundation

## 1. Backend Purpose
This backend service establishes a clean, scalable Node.js/Express.js & MongoDB architecture for **ZAHZAN**, a premium Pakistani women's clothing brand. It handles authentication, role-based security, data modeling for orders, payments, products, AI virtual try-on job tracking, newsletter subscriptions, and customer stories.

---

## 2. Tech Stack
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT), bcryptjs for password hashing
- **Security**: Helmet, CORS (configured with `CLIENT_URL`), Express Rate Limit
- **File Uploads**: Multer (configured for `uploads/`)
- **Environment Management**: `dotenv`

---

## 3. Folder Structure
```
server/
├── config/
│   └── db.js                       # Mongoose database connection
├── controllers/
│   ├── adminController.js          # Admin dashboard & management handlers
│   ├── authController.js           # Auth handlers (register, login, refresh, me, logout)
│   ├── newsletterController.js     # Newsletter subscription handlers
│   ├── orderController.js          # Order management handlers
│   ├── paymentController.js        # Payment submission handlers
│   ├── productController.js        # Product catalog handlers
│   ├── storyController.js          # Customer stories handlers
│   ├── tryOnController.js          # AI Try-On job handlers
│   └── userController.js           # User profile & address handlers
├── middleware/
│   ├── adminMiddleware.js          # Role verification (requireAdmin)
│   ├── authMiddleware.js           # Bearer JWT protection (protect)
│   ├── errorMiddleware.js          # Centralized error handler & 404 handler
│   └── uploadMiddleware.js         # Multer storage configuration for images
├── models/
│   ├── Address.js                  # User delivery addresses schema
│   ├── AdminUser.js                # Admin user metadata & permissions schema
│   ├── AuditLog.js                 # Admin action audit trail schema
│   ├── NewsletterSubscriber.js     # Newsletter subscriptions schema
│   ├── Notification.js             # User & admin notifications schema
│   ├── Order.js                    # Order schema with embedded OrderItems & shipping info
│   ├── OrderItem.js                # Order item historical snapshot schema
│   ├── Payment.js                  # Manual & digital payment proofs schema
│   ├── Product.js                  # Product catalog & color variants schema
│   ├── StorySubmission.js          # Customer review stories schema
│   ├── TryOnJob.js                 # AI Virtual Try-On job processing queue schema
│   └── User.js                     # User account & authentication schema
├── routes/
│   ├── adminRoutes.js              # /api/admin
│   ├── authRoutes.js               # /api/auth
│   ├── newsletterRoutes.js         # /api/newsletter
│   ├── orderRoutes.js              # /api/orders
│   ├── paymentRoutes.js            # /api/payments
│   ├── productRoutes.js            # /api/products
│   ├── storyRoutes.js              # /api/stories
│   ├── tryOnRoutes.js              # /api/try-on
│   └── userRoutes.js               # /api/users
├── scripts/
│   └── seedAdmin.js                # Admin seed script
├── utils/
│   └── jwt.js                      # JWT token generation & verification utilities
├── uploads/                        # Upload storage directory
├── .env                            # Active environment variables (git-ignored)
├── .env.example                    # Environment variable template
├── .gitignore                      # Git ignored files & directories
├── package.json                    # Backend dependencies & scripts
└── server.js                       # Express server initialization entrypoint
```

---

## 4. Environment Variables
Copy `.env.example` to `.env` and fill in the values:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/zahzan_db
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_here
JWT_REFRESH_EXPIRES_IN=30d

CLIENT_URL=http://localhost:5173

EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=your_email_user
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@zahzan.com

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

AI_API_KEY=your_ai_api_key

ADMIN_EMAIL=admin@zahzan.com
ADMIN_PASSWORD=change_this_admin_password_123
```

---

## 5. MongoDB Setup
Ensure MongoDB is installed locally or provide a remote MongoDB Atlas connection URI in `MONGODB_URI`.
The server connects automatically on launch and exits gracefully if MongoDB is unreachable.

---

## 6. Installation Commands
Navigate to the `server` folder and install dependencies:
```bash
cd server
npm install
```

---

## 7. Development & Seeding Commands
Run development server with auto-reload:
```bash
npm run dev
```

Run production server:
```bash
npm start
```

Seed initial admin account:
```bash
npm run seed:admin
```

---

## 8. API Base URL & Health Check
- Base URL: `http://localhost:5000/api`
- Health check GET request: `http://localhost:5000/api/health`

Response:
```json
{
  "success": true,
  "message": "Zahzan API is running",
  "data": {
    "dbStatus": "connected",
    "environment": "development",
    "timestamp": "2026-08-12T21:13:00.000Z"
  }
}
```

---

## 9. Available Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register a new customer
- `POST /api/auth/login` - Authenticate customer/admin
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current authenticated user profile (`Bearer JWT` required)

### User Management (`/api/users`)
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/addresses` - Get user addresses
- `POST /api/users/addresses` - Add new address

### Products (`/api/products`)
- `GET /api/products` - List products
- `GET /api/products/:slug` - Get product details
- `POST /api/products` - Create product (`Admin` required)

### Orders (`/api/orders`)
- `POST /api/orders` - Place order
- `GET /api/orders/my-orders` - List customer orders
- `GET /api/orders/:id` - Get order details

### Payments (`/api/payments`)
- `POST /api/payments/proof` - Upload payment proof screenshot
- `GET /api/payments/:id` - Get payment status

### AI Virtual Try-On (`/api/try-on`)
- `POST /api/try-on` - Queue try-on job
- `GET /api/try-on/:id` - Get job processing status

### Newsletter (`/api/newsletter`)
- `POST /api/newsletter/subscribe` - Subscribe email
- `POST /api/newsletter/unsubscribe` - Unsubscribe email

### Customer Stories (`/api/stories`)
- `POST /api/stories` - Submit customer story with image
- `GET /api/stories` - Get approved stories

### Admin (`/api/admin`)
- `GET /api/admin/dashboard` - Admin dashboard stats (`Admin` required)
- `GET /api/admin/users` - Admin user list (`Admin` required)
- `GET /api/admin/orders` - Admin order list (`Admin` required)

---

## 10. Database Models Summary
- **User**: Authentication, role (`customer`, `admin`), email uniqueness, hashed passwords.
- **Address**: Multiple shipping addresses per user with Pakistani defaults.
- **Product**: Product catalog, color variants, sizes, inventory stock, unique slug indexing.
- **OrderItem**: Subdocument snapshot storing frozen product details for orders.
- **Order**: Order status (`pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`), payment status, shipping address.
- **Payment**: Payment details supporting `JazzCash`, `Easypaisa`, `Bank Transfer`, and `Cash on Delivery`.
- **TryOnJob**: Asynchronous virtual try-on processing status (`queued`, `processing`, `completed`, `failed`).
- **NewsletterSubscriber**: Subscriber list tracking active subscriptions.
- **StorySubmission**: User-generated content reviews with moderation status (`pending`, `approved`, `rejected`).
- **AdminUser**: Administrative role permissions and department metadata.
- **Notification**: Generic user and system notification queue.
- **AuditLog**: Admin activity audit records.

---

## 11. Authentication Architecture
- Passwords are auto-hashed using `bcryptjs` with salt rounds = 10 before saving to database.
- Password hashes are hidden by default in queries (`select: false`).
- Access tokens expire in 7 days; Refresh tokens expire in 30 days.
- Auth middleware (`protect`) extracts Bearer token, verifies signature, and attaches user document to `req.user`.
- Admin middleware (`requireAdmin`) guards administrative routes by checking `req.user.role === 'admin'`.

---

## 12. Future Implementation Plan
1. **Phase 1 (Completed)**: Backend & Database Foundation (Models, Routes, Middlewares, Security, JWT, Seed).
2. **Phase 2**: E-commerce Core APIs (Product management, Shopping cart synchronization, Order creation & inventory reduction).
3. **Phase 3**: Payment Integration (JazzCash / Easypaisa payment proof verification, status transition flow).
4. **Phase 4**: AI Virtual Try-On Engine (Integration with external AI API, background job worker, Cloudinary image upload).
5. **Phase 5**: Newsletter & Email Service (SMTP integration, automated email receipts).
6. **Phase 6**: Frontend Integration (Connecting Auth specifically to `Menu → Account` screen, without altering frozen layout).
