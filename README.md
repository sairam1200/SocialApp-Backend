# Gaddr Backend

Welcome to the backend of **Gaddr** — a NestJS project implementing a clean architectural folder structure based on **Vertical Slice Architecture** and **CQRS (Command Query Responsibility Segregation)**.

## ⚠️ Branching Strategy

### `main` Branch

> **🚫 DO NOT COMMIT, FETCH, OR PULL FROM THIS BRANCH**

* This is the **production** branch and is **off-limits** for all contributors.
* Any changes made directly to `main` are strictly prohibited to protect production integrity.

### `staging` Branch

* Used for **testing features** and validating merged changes.
* Endpoint for testing: [https://testing.gaddr.com](https://testing.gaddr.com)

### `develop` Branch

* The **most up-to-date** branch.
* All contributors should pull from this branch before making any changes.
* Create a **Pull Request (PR)** from your feature branch into `develop`.
* **Direct commits to `develop` are not permitted.**
---

## 🛠 How to Use Migrations

> **Note:** For easier migration management with TypeORM, scripts have been added to the `package.json` .

### Generate a New Migration

Run the following command from the project root:

```bash
npm run migration:generate -- src/infrastructure/migrations/your-migration-name
```

### To run existing migrations:

```bash
npm run migration:run
```

⚠️ Note: dataSource.initialize() is already called in the application lifecycle, so migration:run is usually not required unless you're applying fresh migrations manually.


### 🚀 Running the Project:

To start the backend in development mode, use:

```bash
npm run dev
```

### 🧠 Architecture Overview:

* Framework: NestJS
* Architecture Style: Clean Architecture
* Structural Pattern: Vertical Slice Architecture
* Pattern: CQRS (Command Query Responsibility Segregation)

This structure promotes separation of concerns, scalability, and maintainability.
