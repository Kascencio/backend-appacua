# Backend Technical Report & API Access Guide

## 1. System Overview

The backend is a robust RESTful API built with **Fastify** and **TypeScript**, designed for high performance and type safety. It utilizes **Prisma ORM** for database interactions with a **MySQL** database hosted on a VPS.

### Key Technologies
-   **Framework**: Fastify (v4+)
-   **Language**: TypeScript
-   **Database**: MySQL (hosted on VPS)
-   **ORM**: Prisma
-   **Authentication**: JWT (`@fastify/jwt`) with `bcryptjs` for password hashing.
-   **Real-time**: WebSockets (`@fastify/websocket`) for sensor readings.
-   **Environment Management**: `dotenv` for configuration.

## 2. Architecture

The project follows a layered architecture to ensure separation of concerns:
-   **`src/routes`**: Defines API endpoints and maps them to controllers.
-   **`src/controllers`**: Handles incoming HTTP requests, input validation, and sends responses.
-   **`src/services`**: Contains business logic (e.g., `lecturas.poller.ts`, `ws.lecturas.server.ts`).
-   **`src/repositories`**: (Implied) For direct database access patterns.
-   **`src/config`**: Configuration settings (e.g., `index.ts` for env vars).
-   **`prisma/schema.prisma`**: Defines simple data models and relationships.

## 3. Database Schema

The database is normalized and centers around Organizations, Installations, and Sensors.

### Core Entities
-   **Organization Hierarchy**: `organizacion` -> `organizacion_sucursal` -> `instalacion`.
-   **Users & Access**: `usuario` users have a `tipo_rol` (Role) and are assigned to specific scopes via `asignacion_usuario`.

### Sensor Data Flow
1.  **Catalog**: `catalogo_sensores` defines types of sensors available.
2.  **Installation**: `sensor_instalado` links a physical sensor to an `instalacion`.
3.  **Readings**:
    -   `lectura`: Raw sensor data (high frequency).
    -   `resumen_lectura_horaria`: Aggregated hourly data.
    -   `promedio`: Daily averages.
4.  **Alerts**: `alertas` are generated when readings exceed defined thresholds.

### Biological Data
-   `especies` (Species) have associated parameters (`especie_parametro`) defining ideal ranges (`Rmax`, `Rmin`).
-   `procesos` track the lifecycle of species within an installation.

## 4. How to Access APIs

### Base URL
-   **Local Development**: `http://195.35.11.179:3300`
-   **Production**: `http://195.35.11.179:3300` (or configured domain)

### Authentication
The API uses **Bearer Token** authentication. You must first login to receive a token, which must be included in the header of subsequent requests.

#### 1. Login
**Endpoint**: `POST /api/login`
**Body**:
```json
{
  "correo": "admin@example.com",
  "password": "your_password"
}
```
**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "usuario": { ... }
}
```

#### 2. Making Authenticated Requests
Add the `Authorization` header to your HTTP requests:
```
Authorization: Bearer <YOUR_TOKEN>
```

### Key API Endpoints

#### Users & Roles
-   `GET /api/usuarios` - List all users
-   `POST /api/usuarios` - Create a user
-   `GET /api/tipos-rol` - List available roles

#### Organizations & Branches
-   `GET /api/organizaciones` - Get all organizations
-   `GET /api/sucursales` - Get all branches (sucursales)

#### Installations
-   `GET /api/instalaciones` - Get all installations

#### Sensors & Readings
-   `GET /api/catalogo-sensores` - List sensor types
-   `GET /api/sensores-instalados` - List active sensors
-   `GET /api/lecturas` - Get raw readings (Note: High volume data)
-   `GET /api/alertas` - Get system alerts

#### Configuration
-   `GET /api/parametros` - Get monitoring parameters
-   `GET /api/catalogo-especies` - Get species catalog

## 5. Testing Tools

To interact with the API, we recommend using:
1.  **Postman** or **Insomnia**: Great for GUI-based testing and saving collections.
2.  **curl**: For command-line quick tests.
    ```bash
    # Example: Get Users
    curl -H "Authorization: Bearer <TOKEN>" http://195.35.11.179:3300/api/usuarios
    ```
