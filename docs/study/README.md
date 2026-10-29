# Study notes

Plain-English notes for presenting the project. Suggested reading order (about an hour):

1. [00-overview.md](00-overview.md): what the product is, the business flow, glossary (15 min)
2. [presentation-cheatsheet.md](presentation-cheatsheet.md): demo path, questions, limits (10 min)
3. Role docs (5 min each; Admin, Sales, Purchasing and Warehouse matter most):
   - [01-role-admin.md](01-role-admin.md)
   - [02-role-manager.md](02-role-manager.md)
   - [03-role-sales.md](03-role-sales.md)
   - [04-role-purchasing.md](04-role-purchasing.md)
   - [05-role-warehouse.md](05-role-warehouse.md)
   - [06-role-production.md](06-role-production.md)
   - [07-role-read-only.md](07-role-read-only.md)
4. [schema-relationships.md](schema-relationships.md): every data schema, with diagrams and how stock quantities are worked out (20 min)

Sources: `src/features/team/roles.ts`, `src/features/team/screen-access.ts`, `src/app/layout/AppShell.tsx`, `blocks/data/schemas/`, `blocks/data/indexes.json`, and specs 0003, 0007 to 0015, 0026 to 0028.
