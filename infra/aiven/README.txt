Aiven MySQL — certificado SSL
=============================

1. Aiven Console → tu servicio MySQL → Overview → Connection information
2. Pulsa "Download CA certificate" (ca.pem)
3. Guarda el archivo aquí como:  ca.pem   (misma carpeta que este README)

Sin ca.pem, la conexión desde la app o mysql CLI suele fallar con "Access denied".

Probar en PowerShell (sustituye la ruta al ca.pem):

  & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" `
    -h mysql-XXXX.i.aivencloud.com -P 10862 -u avnadmin -p `
    --ssl-mode=VERIFY_CA `
    --ssl-ca="C:\Users\Yelyzaveta\Documents\Proyecto Core Speak\infra\aiven\ca.pem" `
    defaultdb

No pongas la contraseña en la línea de comandos: usa -p y escríbela cuando pida.

En .env (contraseña con @ u otros símbolos → codificar en URL, ej. @ = %40):

  USE_SQLITE=false
  DATABASE_URL=mysql+pymysql://avnadmin:PASSWORD_URL_ENCODED@HOST:PORT/defaultdb
  MYSQL_SSL_CA=infra/aiven/ca.pem

RENDER (dashboard → Environment):
  USE_SQLITE=false
  DATABASE_URL=mysql+pymysql://avnadmin:...@HOST:PORT/defaultdb
  MYSQL_SSL_CA_CONTENT=<pega aquí todo el contenido del archivo ca.pem>
  APP_BASE_URL=https://tu-servicio.onrender.com
  (+ JWT_SECRET_KEY, GROQ_API_KEY, etc.)

  En Aiven → Allowed inbound IP addresses: permite 0.0.0.0/0 (pruebas) o la IP de Render
  (en logs de error suele salir, ej. 74.220.48.29).

  Si ves "Access denied for user 'avnadmin'@'IP'":
  - Resetea la contraseña en Aiven y actualiza MYSQL_PASSWORD en Render.
  - Usa MYSQL_HOST + MYSQL_PASSWORD (no DATABASE_URL) para no romper símbolos en la clave.

  Tras el deploy, revisa logs: debe aparecer "MySQL SSL: usando CA" y "host=....aivencloud.com".
  No debe decir "SQLite".
