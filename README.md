# LISTA_RETRO_INS

Formulario web para revisar la retroalimentacion del INS, escribir observaciones de las UPGD y conservarlas al volver a abrir.

## Como funciona

- `index.html`, `styles.css` y `script.js` forman la interfaz.
- `data.js` sirve como carga inicial local y funciona aunque abras `index.html` directamente.
- `Code.gs` sirve para conectar la hoja real de Google Sheets y guardar las observaciones en la columna `C`.

## Conexion con Google Sheets

1. Abre el archivo de Google Sheets.
2. Ve a `Extensiones > Apps Script`.
3. Copia el contenido de `Code.gs`.
4. Ajusta `SHEET_NAME` si cambia el nombre de la pestaña.
5. Despliega como aplicacion web con acceso para quienes usen el formulario.
6. Copia la URL del despliegue y pegala en `CONFIG.appsScriptUrl` dentro de `script.js`.

## Comportamiento esperado

- Si `appsScriptUrl` tiene valor, la app carga y guarda en Google Sheets.
- Si `appsScriptUrl` esta vacio, la app usa `data.js` y guarda observaciones en `localStorage` del navegador.
