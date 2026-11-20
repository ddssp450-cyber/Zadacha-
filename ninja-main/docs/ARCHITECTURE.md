# Architecture – MySQL edition

- Browser: React 19 + TypeScript + Vite.
- API: Express running in the same Node.js process as the frontend static server.
- Persistence: MySQL 8.4 / InnoDB through the `mysql2` promise driver.
- Authentication: opaque random session token in an HttpOnly cookie; only its SHA-256 hash is stored in MySQL.
- Password storage: Node.js scrypt with per-password random salt (existing format retained).
- Authorization: existing building membership and role rules are enforced by the Express API.

## Persistence model

The current application represents domain records as collections (`buildings`, `apartments`, `payments`, `appliances`, `repairTickets`, `defects`, `calendarEvents`, `expenses`). To avoid breaking existing components and demo records, those documents remain in MySQL JSON columns in `building_records`. Users, sessions and memberships are stored in separate relational tables with indexes and the session-to-user foreign key.

## Startup and seed

`server.ts` calls `initDb()` before listening. It creates missing tables and seeds the original demo users and building only when the corresponding tables are empty. The same DDL is also provided as `database/migrations/001_initial_schema.sql` for database administration and container initialization.

## Transaction boundaries

Building creation, building deletion, demo reset, expense creation and expense deletion use MySQL transactions. The expense reserve balance is updated in the same transaction as the expense record.
