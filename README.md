# AUTO-CONTROL 2.0

Gestión de flota de vehículos en alquiler: pagos diarios, documentos y mantenimientos. Cada negocio tiene sus datos aislados de los demás.

- **Backend:** Node.js 22+ (JavaScript, ES modules), Express 5, Prisma 7, PostgreSQL 16
- **Frontend:** HTML + Alpine.js + Tailwind (CDN), sin compilación, mobile-first
- **Roles:**
  - **Superadmin** (se crean solo por consola): crea y suspende negocios con su administrador. Sin límite de vehículos por negocio.
  - **Administrador:** dueño de un negocio, con acceso completo a sus datos.
  - **Operador:** puede ver y crear, pero no editar ni eliminar.

```
autocontrol/
├─ backend/    API (src/modules/*: routes → service → prisma), prisma/, tests/
├─ frontend/   una página HTML por módulo + js/ (app.js, api.js, session.js, pages/)
└─ auto-controlv1.html   prototipo original (referencia)
```

## Desarrollo local (Windows)

1. Crear el usuario y la base en PostgreSQL. El comando pide la contraseña del usuario `postgres`:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE autocontrol LOGIN CREATEDB PASSWORD 'LA_CLAVE_DE_TU_.env';" -c "CREATE DATABASE autocontrol OWNER autocontrol;"
   ```
2. Configurar e instalar:
   ```powershell
   cd backend
   copy .env.example .env      # y completa los valores
   npm install
   npm run db:migrate          # crea las tablas
   npm run db:seed             # datos de demo (contraseña: Demo12345)
   npm run dev                 # http://localhost:3000
   ```
3. Para probar desde el celular, conéctalo a la misma red WiFi y abre la dirección "Desde el celular" que muestra la consola. Si no carga, permite Node.js en el Firewall de Windows (redes privadas).

### Usuarios de demo (`npm run db:seed`)
Se inicia sesión con **usuario o correo**. Contraseña de los usuarios de demo: `Demo12345`.
| Rol | Usuario |
|---|---|
| Admin, negocio 1 "Autos Lima Norte" | admin1 |
| Operador, negocio 1 | operador1 |
| Admin, negocio 2 "Movilidad Sur" | admin2 |
| Operador, negocio 2 | operador2 |

Los superadmins no vienen en el seed: se crean con `npm run superadmin` (ver abajo).

### Comandos útiles (dentro de `backend/`)
| Comando | Qué hace |
|---|---|
| `npm run dev` | API y frontend con recarga automática |
| `npm test` | Tests (usan la base `autocontrol_test`, nunca la de desarrollo) |
| `npm run db:migrate` | Crea una migración después de cambiar `prisma/schema.prisma` |
| `npm run db:studio` | Explorador visual de la base de datos |
| `npm run superadmin -- --username usuario --password "clave"` | Crea un superadmin (opcional: `--name`, `--email`) |
| `npm run superadmin -- --username usuario --reset-password` | Restablece la contraseña de un superadmin |
| `npm run superadmin -- --list` | Lista los superadmins |

## Convenciones
- Toda tabla de negocio tiene `org_id`. Los servicios **siempre** filtran por `req.ctx.orgId`, que se toma de la sesión y nunca del body.
- Toda acción que modifica datos llama a `audit()` (en `src/lib/audit.js`) **dentro de la misma transacción**.
- Los permisos se aplican con `requireRole(...)` en el backend. En el frontend, `can(user, 'records:edit')` solo sirve para mostrar u ocultar botones.
- Dinero en `Decimal(10,2)` y cálculos en céntimos (`src/lib/money.js`). Fechas de negocio como `YYYY-MM-DD` en hora de Lima (`src/lib/dates.js`).
- Los mensajes de error que ve el usuario están en español.
