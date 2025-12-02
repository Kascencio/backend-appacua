# API Integration Guide

This guide details how to connect your frontend application to the backend API.

## Base URL
All endpoints are prefixed with `/api`.
Example: `http://localhost:3300/api/login`

## Authentication
The API uses JWT (JSON Web Tokens) for authentication.

### Login
**Endpoint:** `POST /api/login`

**Request Body:**
```json
{
  "correo": "admin@example.com",
  "password": "your_password"
}
```

**Response (Success - 200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id_usuario": 1,
    "nombre_completo": "Admin User",
    "correo": "admin@example.com",
    "id_rol": 1,
    "estado": "activo",
    "tipo_rol": {
      "id_rol": 1,
      "nombre": "ADMIN"
    }
  }
}
```

**Usage:**
Store the `token` (e.g., in `localStorage`). Include it in the `Authorization` header for protected routes:
`Authorization: Bearer <your_token>`

---

## Endpoints

### 1. Users (Usuarios)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/usuarios` | Create a new user |
| `GET` | `/api/usuarios` | List all users |
| `GET` | `/api/usuarios/:id` | Get user by ID |
| `PUT` | `/api/usuarios/:id` | Update user |
| `DELETE` | `/api/usuarios/:id` | Delete user |

### 2. Roles (Tipos de Rol)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/tipos-rol` | Create a role |
| `GET` | `/api/tipos-rol` | List all roles |
| `GET` | `/api/tipos-rol/:id` | Get role by ID |
| `PUT` | `/api/tipos-rol/:id` | Update role |
| `DELETE` | `/api/tipos-rol/:id` | Delete role |

### 3. Organizations (Organizaciones)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/organizaciones` | Create organization |
| `GET` | `/api/organizaciones` | List organizations |
| `GET` | `/api/organizaciones/:id` | Get organization by ID |
| `PUT` | `/api/organizaciones/:id` | Update organization |
| `DELETE` | `/api/organizaciones/:id` | Delete organization |

### 4. Branches (Sucursales)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/sucursales` | Create branch |
| `GET` | `/api/sucursales` | List branches |
| `GET` | `/api/sucursales/:id` | Get branch by ID |
| `PUT` | `/api/sucursales/:id` | Update branch |
| `DELETE` | `/api/sucursales/:id` | Delete branch |

### 5. Installations (Instalaciones)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/instalaciones` | Create installation |
| `GET` | `/api/instalaciones` | List installations |
| `GET` | `/api/instalaciones/:id` | Get installation by ID |
| `PUT` | `/api/instalaciones/:id` | Update installation |
| `DELETE` | `/api/instalaciones/:id` | Delete installation |

### 6. Sensor Catalog (Catálogo Sensores)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/catalogo-sensores` | Create sensor type |
| `GET` | `/api/catalogo-sensores` | List sensor types |
| `GET` | `/api/catalogo-sensores/:id` | Get sensor type by ID |
| `PUT` | `/api/catalogo-sensores/:id` | Update sensor type |
| `DELETE` | `/api/catalogo-sensores/:id` | Delete sensor type |

### 7. Installed Sensors (Sensores Instalados)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/sensores-instalados` | Register installed sensor |
| `GET` | `/api/sensores-instalados` | List installed sensors |
| `GET` | `/api/sensores-instalados/:id` | Get installed sensor by ID |
| `PUT` | `/api/sensores-instalados/:id` | Update installed sensor |
| `DELETE` | `/api/sensores-instalados/:id` | Delete installed sensor |

### 8. Readings (Lecturas)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/lecturas` | Get raw readings |
| `GET` | `/api/resumen-horario` | Get hourly summary |
| `GET` | `/api/promedios` | Get averages |
| `GET` | `/api/reportes/xml` | Download XML report |

### 9. Species (Especies)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/catalogo-especies` | Create species |
| `GET` | `/api/catalogo-especies` | List species |
| `GET` | `/api/catalogo-especies/:id` | Get species by ID |
| `PUT` | `/api/catalogo-especies/:id` | Update species |
| `DELETE` | `/api/catalogo-especies/:id` | Delete species |

### 10. Processes (Procesos)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/procesos` | Create process |
| `GET` | `/api/procesos` | List processes |
| `GET` | `/api/procesos/:id` | Get process by ID |
| `PUT` | `/api/procesos/:id` | Update process |
| `DELETE` | `/api/procesos/:id` | Delete process |

### 11. Alerts (Alertas)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/alertas` | Create alert |
| `GET` | `/api/alertas` | List alerts |
| `GET` | `/api/alertas/:id` | Get alert by ID |
| `PUT` | `/api/alertas/:id` | Update alert |
| `DELETE` | `/api/alertas/:id` | Delete alert |

### 12. Parameters (Parámetros)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/parametros` | Create parameter |
| `GET` | `/api/parametros` | List parameters |
| `GET` | `/api/parametros/:id` | Get parameter by ID |
| `PUT` | `/api/parametros/:id` | Update parameter |
| `DELETE` | `/api/parametros/:id` | Delete parameter |
