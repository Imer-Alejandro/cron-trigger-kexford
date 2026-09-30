# cron-trigger

Disparador periodico que despierta al servidor de boletines cada 5 minutos.

Este proyecto **no tiene dependencias, no importa Prisma y nunca abre conexion a la base de datos**.
Su unico trabajo es hacer un `POST` a `/worker/run`. Toda la logica de negocio (consultar
campañas activas, enviar correos, actualizar contadores) vive en el servidor principal.

## Como funciona

```
cron-trigger (Render, type: cron)  --POST /worker/run-->  servidor Render  -->  Postgres + SMTP
   sin dependencias, sin DB                                    unica conexion a la DB
```

Ventajas frente a tener el cron dentro del servidor:

- El servidor web puede seguir en el plan `free` y dormirse sin afectar los envios.
- Un fallo del cron no tumba el servidor, y un deploy del servidor no corta un envio en curso.
- Render garantiza una sola ejecucion activa a la vez, asi que no hay ticks solapados.

## Despliegue en Render

Opcion A, desde el repositorio actual:

1. Render Dashboard > New > Blueprint.
2. Selecciona el repositorio `boletines-kexford`.
3. En **Root Directory** pon `cron-trigger`.
4. Render leera el `render.yaml` de esa carpeta y creara el cron job.
5. Configura las variables marcadas como `sync: false`.

Opcion B, como repositorio independiente:

1. Copia esta carpeta a su propio repositorio.
2. Render Dashboard > New > Cron Job, apunta a ese repositorio.
3. Command: `node index.js`, Schedule: `*/5 * * * *`.

En ambas opciones el cron queda como un servicio independiente dentro de tu cuenta de Render,
asi que puedes moverlo a otro proyecto o workspace cuando quieras.

## Variables de entorno

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `RENDER_API_URL` | si | URL publica del servidor, sin ruta. Ej. `https://server-boletin-kexford.onrender.com` |
| `API_KEY` | si | Mismo valor que `API_KEY` en el servidor |
| `API_EMAIL` | si | Mismo valor que `API_EMAIL` en el servidor |
| `REQUEST_TIMEOUT_MS` | no | Tiempo maximo de espera de la respuesta. Default `50000` |

## Coste

Render factura los cron jobs por segundo de ejecucion real, con un **minimo de $1/mes** por
servicio. Un disparo que dura ~3 s cada 5 min son ~14 min de computo al mes, asi que se paga
el minimo. El workspace Hobby ($0) admite cron jobs.

## Codigos de salida

- `0` — el servidor respondio correctamente.
- `1` — fallo de configuracion, timeout, o el servidor respondio con error.

Render registra el fallo en la pestana **Runs**, lo que permite alertar si el envio se detiene.

## Probarlo en local

```bash
$env:RENDER_API_URL="https://server-boletin-kexford.onrender.com"
$env:API_KEY="<tu-api-key>"
$env:API_EMAIL="ops@example.com"
node index.js
```

## La respuesta del servidor

```json
{ "ok": true, "processed": 3, "deferred": 12, "duration_ms": 1840 }
```

- `processed` — destinatarios enviados en este tick.
- `deferred` — destinatarios listos pero aplazados porque la campana alcanzo su `hourly_limit`.
- `skipped` — el tick se omite si ya hay un worker en ejecucion.
