# Instalar AUTO-CONTROL en el servidor (Ubuntu 20.04 + Apache)

Guía paso a paso para la **demo**. Cada bloque se copia y pega en la terminal del servidor.
Usa tu usuario normal (con `sudo`), **no** `root`.

**Resultado:**

```
Celular / PC ──HTTPS──> Apache (proyecto.TU-DOMINIO)
                          ├─ /      → /var/www/autocontrol/frontend   (pantallas)
                          └─ /api/  → 127.0.0.1:3005  → Node 24 (PM2) → PostgreSQL 16 (solo local)
```

Cambia en todos los comandos:

| Texto | Por |
|---|---|
| `proyecto.TU-DOMINIO` | tu subdominio real |
| `CLAVE_BD` | una contraseña larga para la base de datos (sin `@ : / ? #`) |

> No se toca nada de lo que ya funciona en el servidor: Node 20 sigue igual, Apache solo recibe
> un sitio nuevo y PostgreSQL escucha únicamente dentro del servidor.

---

## 0. Revisiones previas

```bash
# El subdominio debe responder con la IP pública de este servidor
getent hosts proyecto.TU-DOMINIO
curl -s https://ifconfig.me ; echo

# Sitios que ya sirve Apache (para no chocar con ninguno)
sudo apache2ctl -S

# Los puertos 3005 (API) y 5432 (PostgreSQL) deben estar libres: no debe salir nada
sudo ss -ltnp | grep -E ':3005|:5432'
```

Si el puerto 3005 está ocupado, elige otro (por ejemplo 3015) y úsalo en el paso 4 (`PORT`) y en el paso 7.

### Si el servidor ya tiene otros proyectos con PM2

PM2 guarda una lista de procesos **por usuario de Linux**. AUTO-CONTROL se agrega con el **mismo usuario**
que ya administra tus otros proyectos (así aparecen todos juntos y se levantan juntos al reiniciar).

```bash
whoami                                   # usuario con el que estás conectado
ps -eo user,cmd | grep "[P]M2 v"         # usuario dueño del PM2 que ya corre (debe ser el mismo)
which pm2 ; pm2 -v
pm2 ls                                   # tus proyectos actuales (no deben aparecer vacíos)
systemctl list-units --type=service | grep -i pm2    # ¿ya arranca solo al reiniciar? (pm2-<usuario>.service)
```

- Si `pm2 ls` sale **vacío** pero sabes que hay proyectos corriendo, estás con otro usuario:
  conéctate con el usuario que muestra `ps` (o usa `sudo -iu ESE_USUARIO`) y sigue la guía con él.
- No se instala otro PM2: se usa el que ya tienes. Cada app usa su propio Node
  (tus proyectos siguen con Node 20; AUTO-CONTROL usa Node 24).
- Los scripts solo reinician `autocontrol-api`; nunca tocan tus otros procesos.

---

## 1. PostgreSQL 16

Ubuntu 20.04 ya no recibe paquetes nuevos de PostgreSQL; la versión 16 se instala desde el
**archivo oficial** de PostgreSQL (`apt-archive.postgresql.org`), la misma versión mayor que en desarrollo.

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt-archive.postgresql.org/pub/repos/apt focal-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-16
psql --version          # → psql (PostgreSQL) 16.x
```

Crear el usuario y la base de datos de la app:

```bash
sudo -u postgres psql -c "CREATE ROLE autocontrol LOGIN PASSWORD 'CLAVE_BD';"
sudo -u postgres psql -c "CREATE DATABASE autocontrol OWNER autocontrol ENCODING 'UTF8' TEMPLATE template0;"
sudo -u postgres psql -c "ALTER DATABASE autocontrol SET timezone TO 'America/Lima';"
```

Comprobar que PostgreSQL **solo** escucha dentro del servidor (debe decir `127.0.0.1:5432`):

```bash
sudo ss -ltnp | grep 5432
```

---

## 2. Node 24 con nvm (solo para AUTO-CONTROL)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
node -v                 # → v24.x
```

> `nvm install` no reemplaza el Node 20 del sistema (`/usr/bin/node`); las otras apps siguen igual.

PM2: el servidor **ya lo tiene** (paso 0), no se instala otro. Solo si `which pm2` no mostró nada:

```bash
which pm2 || npm install -g pm2
```

> Si tu PM2 se instaló con otra versión de Node de nvm, después de `nvm use 24` el comando `pm2`
> podría "desaparecer". `deploy.sh` lo ubica antes de cambiar de versión; si aun así no lo encuentra:
> `PM2_BIN=/ruta/que/mostró/which/pm2 ./deploy/deploy.sh`

---

## 3. Descargar el código

```bash
sudo mkdir -p /var/www/autocontrol
sudo chown "$USER":"$USER" /var/www/autocontrol
git clone https://github.com/jguayanc93/auto-control.v1.git /var/www/autocontrol
cd /var/www/autocontrol
chmod +x deploy/*.sh
```

---

## 4. Configuración (`backend/.env`)

```bash
cd /var/www/autocontrol
cp deploy/env.production.example backend/.env
chmod 600 backend/.env
openssl rand -hex 48      # copia el resultado: es tu JWT_SECRET
nano backend/.env
```

En `nano` completa:

- `DATABASE_URL=postgresql://autocontrol:CLAVE_BD@localhost:5432/autocontrol?schema=public`
- `JWT_SECRET=` el texto que generó `openssl`
- `PORT=3005` (u otro si estaba ocupado)

Guardar: `Ctrl+O`, `Enter`, salir: `Ctrl+X`.

---

## 5. Primera instalación de la app

```bash
cd /var/www/autocontrol
./deploy/deploy.sh
```

Hace: `git pull` → `npm ci` → crea las tablas (migraciones) → inicia la API con PM2.
Debe terminar con **✔ AUTO-CONTROL actualizado**.

`deploy.sh` ya ejecutó `pm2 save`: la lista guardada ahora incluye tus proyectos **y** AUTO-CONTROL.

```bash
pm2 ls        # tus proyectos + autocontrol-api (online)
```

Arranque automático al reiniciar el servidor:

- Si en el paso 0 **ya existía** el servicio `pm2-<usuario>`: no hagas nada más.
- Si **no existía**:

  ```bash
  pm2 startup systemd
  # ↑ imprime un comando que empieza con "sudo env PATH=…": cópialo y ejecútalo
  pm2 save
  ```

---

## 6. Superadministradores

Pon **un espacio al inicio** de la línea para que la contraseña no quede en el historial:

```bash
cd /var/www/autocontrol/backend
 npm run superadmin -- --username cvaca --password "CONTRASEÑA" --name "Nombre"
 npm run superadmin -- --username jguayan --password "CONTRASEÑA" --name "Nombre"
npm run superadmin -- --list
```

> En el servidor **no** se cargan los datos de demo (`admin1`, `Demo12345`…): el seed está bloqueado
> en producción. Los negocios se crean desde el panel del superadmin.

---

## 7. Apache

```bash
sudo a2enmod proxy proxy_http headers
sudo cp /var/www/autocontrol/deploy/apache/autocontrol.conf /etc/apache2/sites-available/autocontrol.conf
sudo nano /etc/apache2/sites-available/autocontrol.conf
#   → cambia proyecto.TU-DOMINIO (y 3005 si usaste otro puerto)
sudo a2ensite autocontrol
sudo apache2ctl configtest        # debe decir: Syntax OK
sudo systemctl reload apache2
```

---

## 8. HTTPS (certificado gratuito Let's Encrypt)

> Hasta este paso **no se puede iniciar sesión**: la cookie de sesión solo viaja por HTTPS.

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d proyecto.TU-DOMINIO
#   → correo para avisos, aceptar términos, y elegir "Redirect" (http → https)
sudo certbot renew --dry-run      # prueba de la renovación automática
```

---

## 9. Respaldos automáticos (diarios, 3 a. m., se guardan 14 días)

```bash
sudo mkdir -p /var/backups/autocontrol
sudo chown "$USER":"$USER" /var/backups/autocontrol
/var/www/autocontrol/deploy/backup.sh          # prueba manual
crontab -e
```

Agregar al final:

```
0 3 * * * /var/www/autocontrol/deploy/backup.sh >> $HOME/autocontrol-backup.log 2>&1
```

> Los respaldos incluyen los PDF y fotos. De vez en cuando copia uno **fuera del servidor**
> (por ejemplo con WinSCP a tu PC).

---

## 10. Verificación

```bash
curl -s https://proyecto.TU-DOMINIO/api/health      # → {"status":"ok","db":"ok",...}
pm2 status                                           # autocontrol-api → online
```

En el celular abre `https://proyecto.TU-DOMINIO`, debe verse el candado y el inicio de sesión.
Entra con `cvaca` y crea el primer negocio.

---

## Día a día

| Tarea | Comando |
|---|---|
| Publicar una nueva versión (después de `git push` desde la PC) | `cd /var/www/autocontrol && ./deploy/deploy.sh` |
| Ver errores de la API | `pm2 logs autocontrol-api --lines 100` |
| Estado | `pm2 status` |
| Reiniciar la API | `pm2 restart autocontrol-api` |
| Respaldo manual | `./deploy/backup.sh` |
| Restaurar un respaldo | `./deploy/restore.sh /var/backups/autocontrol/<archivo>.dump` |
| Errores de Apache | `sudo tail -n 50 /var/log/apache2/autocontrol-error.log` |
| Restablecer contraseña de un superadmin | `cd backend && npm run superadmin -- --username cvaca --reset-password` |

## Problemas frecuentes

- **"Service Unavailable" (503):** la API no está corriendo → `pm2 logs autocontrol-api`.
- **No deja iniciar sesión:** estás entrando por `http://`; usa `https://` (paso 8).
- **`deploy.sh` dice "Se necesita Node 24":** `nvm install 24` y vuelve a ejecutarlo.
- **La API no arranca y el log dice "Configuración inválida":** revisa `backend/.env` (el mensaje indica qué variable).
