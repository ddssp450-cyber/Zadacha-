# Ninja – Building Management

Ninja is the existing React + TypeScript + Express application, configured to use **MySQL 8.4** for persistent server-side storage.

## Requirements

- Windows 10/11, macOS or Linux
- Docker Desktop with Docker Compose v2
- 4 GB RAM recommended

## Quick start (recommended)

1. Extract the project ZIP.
2. Copy `.env.example` to `.env` in the project root.
3. Change `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD` to long, unique passwords.
4. Start Docker Desktop and wait until it is running.
5. Open a terminal in the project folder and run:

   ```bash
   docker compose up --build -d
   ```

6. Open <http://localhost:8080>.

The first start creates the MySQL schema and seeds the existing demo accounts and demo building. The database is stored in the named Docker volume `ninja_mysql_data` and survives container restarts.

## Demo accounts

The project retains the original demo account passwords:

| Role | Password |
|---|---|
| Owner | `admin123` |
| Tenant | `tenant123` |
| Builder | `builder123` |
| Craftsman | `master123` |

Use the email addresses displayed by the existing login screen's quick-fill controls. Change demo passwords before exposing an installation to the public internet.

## Useful commands

```bash
docker compose up -d                 # start

docker compose up --build -d        # rebuild and start

docker compose logs -f app          # application logs

docker compose logs -f mysql        # database logs

docker compose ps                   # service status

docker compose down                 # stop (keeps database volume)

docker compose down -v              # DELETE database volume and all local data
```

## Local development without Docker for the app

You still need a running MySQL 8 server. Create a database and user matching `.env.example`, copy `.env.example` to `.env`, then run:

```bash
npm install --legacy-peer-deps
npm run dev
```

Set `MYSQL_HOST=127.0.0.1` and `MYSQL_PORT=3306` for a local MySQL service. Never put database credentials in frontend files or commit `.env`.

## Database and migrations

- Runtime schema bootstrap and demo seeding: `db.ts`.
- Initial MySQL DDL migration: `database/migrations/001_initial_schema.sql`.
- Tables: `users`, `sessions`, `memberships`, `building_records`.
- JSON documents remain in MySQL's native `JSON` columns to preserve the existing application's record shape and avoid destructive UI rewrites.
- All SQL runs on the server through the `mysql2` driver. The frontend never receives database credentials.

The current codebase stores application domain records as typed collections in `building_records` JSON documents. This migration changes the database engine to MySQL while preserving that existing data model; it does **not** claim a fully normalized relational model for every business entity.

## Backup and restore

Create a SQL dump:

```bash
docker compose exec -T mysql sh -c 'exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > ninja-backup.sql
```

Restore into an existing database (this overwrites matching table contents; take a backup first):

```bash
docker compose exec -T mysql sh -c 'exec mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < ninja-backup.sql
```

## Production notes

- Replace all example passwords and configure `ADMIN_EMAILS` before deployment.
- Use HTTPS through a reverse proxy and restrict access to the MySQL service; Compose does not publish the database port.
- Configure SMTP credentials if invitation emails are required.
- Configure `ANTHROPIC_API_KEY` only if the existing AI endpoints are to be enabled.
- Set up off-server encrypted backups and test restores before onboarding customers.
- The original application authorization model and JSON collection structure are retained. Perform a security review and complete end-to-end testing before using this as a commercial multi-customer service.

## Troubleshooting

- If the app starts before MySQL is ready, Compose health checks normally prevent this. Check `docker compose logs mysql` and then `docker compose logs app`.
- If port 8080 is occupied, change `APP_PORT` in `.env` and restart with `docker compose up -d`.
- If you change MySQL credentials after the data volume has already been initialized, MySQL will keep the original credentials in that volume. Update the database user inside MySQL or recreate the volume (the latter deletes all stored data).
