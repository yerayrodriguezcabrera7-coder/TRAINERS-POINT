# Trainers Point

Aplicación con servidor API, app web y app móvil.

**Para localizar el código:** consulta el [mapa del proyecto y las optimizaciones](docs/estructura-y-optimizacion.md). Todas las pantallas están en `web/`, organizadas por apartado; el servidor está en `src/` y la base de datos en `prisma/`.

## 📋 Requisitos

- Node.js 22 o superior
- npm instalado

## 🚀 Arranque rápido

El proyecto tiene **dos servidores** que se levantan en terminales separadas.

### Paso 1: Instalar dependencias

```bash
cd /Users/nozar/Documents/GitHub/DAW/Practicas/TRAINERS-POINT
npm install
```

### Paso 2: Configurar variables de entorno

```bash
cp .env.example .env
```

> ⚠️ No compartas ni imprimas el archivo `.env`.

---

### Paso 3: Levantar el Backend (API) — Terminal 1

```bash
npm run dev
```

✅ **Backend corriendo en:** http://localhost:3000/

Este servidor levanta:
- Base de datos PostgreSQL local (puerto `55439`)
- API REST del CRM y calendario
- Recarga automática al cambiar código

> La base de datos se guarda en `.calendar-dev/` (no se borra entre ejecuciones).

---

### Paso 4: Levantar la App Móvil (Web) — Terminal 2

```bash
cd mobile/trainerspoint
npm install
npm run export:web
node server-static.cjs
```

✅ **App móvil web corriendo en:** http://localhost:8081/

Este servidor levanta:
- App web estática de la app móvil
- Proxy de API: `/api/*` → `http://localhost:3000`

---

### 🌐 Acceso final

| Servicio | URL | Puerto |
|----------|-----|--------|
| **App web (calendario, CRM, etc.)** | http://localhost:3000/ | 3000 |
| **App móvil (web)** | http://localhost:8081/ | 8081 |

La app móvil (8081) se conecta automáticamente al backend (3000) vía proxy.

---

## 📖 Rutas de la app

| Ruta | Descripción |
|------|-------------|
| `/` o `/index.html` | Calendario |
| `/inicio.html` | Inicio |
| `/fichajes.html` | Fichajes |
| `/gestion.html?section=services` | Servicios |
| `/clientes` | Clientes |
| `/gimnasios` | Gimnasios |
| `/login.html` | Acceso del equipo |
| `/change-password.html` | Cambio de contraseña |

---

## 🔑 Acceso

- Al crear una cuenta, el usuario es el nombre elegido y la contraseña temporal es `Trainerspoint`.
- El primer inicio obliga a cambiarla.
- Las contraseñas se almacenan con scrypt (hash con salt aleatorio).

---

## 🛠 Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo con recarga (backend + DB local) |
| `npm run build` | Compilar backend (genera `dist/`) |
| `npm start` | Producción: compila y arranca |
| `npm test` | Ejecuta las pruebas |
| `npm run prisma:generate` | Genera el cliente Prisma |
| `npm run prisma:studio` | Abre Prisma Studio (base de datos visual) |
| `npm run export:web` | Compilar app móvil web (en `mobile/trainerspoint/`) |
| `npm run db:test` | Comprueba la conexión a la base de datos |
| `npm run db:backup` | Copia de seguridad de la base de datos |
| `npm run db:restore` | Restaurar desde copia de seguridad |

---

## 📂 Estructura

```
.
├── src/              # Código del servidor (API)
├── web/              # Pantallas web (HTML/CSS/JS)
├── mobile/           # App móvil (React Native/Expo)
│   └── trainerspoint/
│       ├── dist/     # Web exportada
│       └── server-static.cjs  # Servidor de la app web
├── prisma/           # Modelo y migraciones de base de datos
├── scripts/          # Scripts de automatización
├── docs/             # Documentación
├── tests/            # Pruebas
└── .calendar-dev/    # Base de datos local (no versionada)
```

---

## 💾 Base de datos

La base de datos local persiste en `.calendar-dev/`. No la borres si quieres conservar los datos.

Para resetearla, borra el directorio `.calendar-dev/` y vuelve a ejecutar `npm run dev`.

---

## ☁️ Integración con AWS (opcional)

La conexión con Cognito, RDS PostgreSQL y API Gateway está documentada en [deploy/aws/README.md](deploy/aws/README.md). Está desactivada por defecto y no crea servicios de pago.

---

## 📚 Documentación adicional

- [Guía de puesta en marcha](docs/puesta-en-marcha.md) — instalación con HTTPS, copias de seguridad, jornada de prueba.
- [Estructura y optimizaciones](docs/estructura-y-optimizacion.md) — mapa del proyecto.