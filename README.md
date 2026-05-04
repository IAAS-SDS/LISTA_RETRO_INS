# LISTA_RETRO_INS

Formulario web para revisar la retroalimentacion del INS, escribir observaciones de las UPGD y laboratorio, y conservarlas al volver a abrir.

## Como funciona

- `index.html`, `styles.css` y `script.js` forman la interfaz.
- `data.js` sirve como carga inicial local y funciona aunque abras `index.html` directamente.
- `Code.gs` sirve para conectar la hoja real de Google Sheets y guardar las observaciones de las UPGD en la columna `C`, las observaciones de laboratorio en la columna `D` y el soporte en la columna `E`.
- La hoja usa la columna `F` para el correo autorizado de la UPGD y la nueva columna `G` para el correo autorizado de laboratorio.
- La columna `H` se usa para el correo supervisor: puede ver las instituciones asignadas, pero no modificar informacion.
- Si la columna `G` esta vacia en una fila, el mismo correo de `F` puede editar tambien la columna de laboratorio.

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
- Los permisos se aplican por fila: UPGD edita observaciones y soportes, laboratorio edita su propia columna, supervisor solo observa, y el correo administrador conserva acceso total.
