# Database operations

## MySQL 8.4

The Compose stack uses MySQL 8.4 and a persistent named volume. The database port is not published to the host by default. The app connects over the private Compose network.

## Environment variables

- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD` is used only by the MySQL container bootstrap.
- `APP_PORT` controls the host port for the web app.

`DATABASE_URL` may also be provided in mysql:// URL form. Do not expose any of these values to the browser.

## Schema

`database/migrations/001_initial_schema.sql` is the baseline DDL. The server also creates missing tables on startup. Existing PostgreSQL data is not automatically imported; export and transform it before switching a live installation.

## Backup and restore

See the backup/restore commands in the root README. Keep encrypted copies outside the server and periodically test restoration.
