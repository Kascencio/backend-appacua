# Backend Analysis and Fixes

## Summary of Changes

1.  **Fixed Compilation Errors**:
    -   Resolved TypeScript errors caused by mismatches between `schema.prisma` model names and the generated Prisma Client.
    -   Ensured all controllers use the correct property names (e.g., `prisma.parametros`, `prisma.alertas`).

2.  **Implemented Authentication**:
    -   Added `bcryptjs` for secure password hashing.
    -   Implemented `login` endpoint at `POST /api/login`.
    -   Updated `createUsuario` to automatically hash passwords before saving to the database.

3.  **Created Seed Script**:
    -   Created `scripts/seed.ts` to populate the database with essential data.
    -   Added `npm run seed` command to `package.json`.

4.  **Configured for VPS**:
    -   Updated `.env` to connect to the VPS database (`195.35.11.179`).
    -   Verified connection and seeded the remote database.

## How to Use

### 1. Build the Project
Ensure the project builds correctly:
```bash
npm run build
```

### 2. Run the Seed Script
Populate the database with initial data (Roles, Admin User, Organization, etc.).
**Note:** This is currently configured to run against the VPS database.
```bash
npm run seed
```

**Default Admin Credentials:**
-   **Email:** `admin@example.com`
-   **Password:** `123456`

### 3. Start the Server
```bash
npm start
```

## API Endpoints Added

-   `POST /api/login`: Authenticate user and receive JWT token.
    -   Body: `{ "correo": "admin@example.com", "password": "123456" }`
