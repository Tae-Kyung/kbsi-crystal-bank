# PostgreSQL Database & Account Setup Request

Hi, I'd like to request a new PostgreSQL database and user account for the KBSI Protein Crystallization Bank project.

## Request Details

| Item | Details |
|------|---------|
| **Database name** | `kbsi_crystal_bank` (negotiable) |
| **User account** | `kbsi_app` (negotiable) |
| **Permissions** | CREATE TABLE, INSERT, UPDATE, DELETE, CREATE FUNCTION |
| **Disk space** | 50 GB minimum (currently ~10 GB, expected to grow) |
| **Remote access** | Required (connections from Vercel deployment servers) |

## Reference SQL

```sql
CREATE DATABASE kbsi_crystal_bank;
CREATE USER kbsi_app WITH PASSWORD '<password>';
GRANT ALL PRIVILEGES ON DATABASE kbsi_crystal_bank TO kbsi_app;
-- After connecting to the new database:
GRANT ALL ON SCHEMA public TO kbsi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kbsi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO kbsi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO kbsi_app;
```

## Remote Access Configuration (if needed)

```bash
# postgresql.conf
listen_addresses = '*'

# pg_hba.conf (allow Vercel IP range)
host  kbsi_crystal_bank  kbsi_app  0.0.0.0/0  md5
```

## Response Form

Please fill in the following and send back:

```
Host:     _________________  (server IP or domain)
Port:     _________________  (default 5432)
Database: _________________
User:     _________________
Password: _________________

Remote access:      [ ] Enabled   [ ] Not available (SSH tunnel required)
SSL:                [ ] Enabled   [ ] Disabled
PostgreSQL version: _______
```

Thank you.
