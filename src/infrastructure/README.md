# Infrastructure Layer

The **Infrastructure Layer** is responsible for handling all external concerns of the application, such as database connectivity, third-party service integration, and concrete implementations of abstract contracts defined in the Domain Layer.

It serves as the bridge between the domain/application logic and the outside world.

---

## 📁 Folder Structure

### `persistence/`

This folder contains the **`dataSource.ts`** file, which is the central configuration point for initializing the connection to the database using **TypeORM**.

* It defines database connection settings (host, port, username, password, entities, migrations, etc.).
* This file is used across the application for accessing and managing the database connection.
* Ensures a consistent and reusable approach to interacting with the database.

### `migrations/`

This folder contains **TypeORM migration files** used for schema evolution and data transformations over time.

* Migrations help maintain the structure of the database in sync with the application's models.
* You can generate and run migrations using the `migration:generate` and `migration:run` npm scripts defined in `package.json`.

### `repositories/`

This folder contains the **concrete implementations of repository interfaces** defined in the Domain Layer.

* These classes interact with the database using TypeORM repositories or query builders.
* They implement business-specific data access patterns.
* Each implementation is mapped to its respective contract (interface) in the Domain layer.

### `services/`

This folder contains the **implementations of service interfaces** declared in the Domain Layer.

* These services may interact with APIs, third-party tools, or contain infrastructure-specific business logic.
* They are used to offload application logic that requires external systems (e.g., sending emails, payment processing).
* Keeps infrastructure concerns separate from core business rules.

### `dependency.ts`

This file defines the **Dependency Injection container** (often a plain object or registry) that aggregates all repository and service implementations used in the application.

* It acts as the source of truth for infrastructure dependencies.
* Makes wiring dependencies into modules and features seamless.
* Promotes maintainability and centralizes updates when dependencies change.

```ts
// Example (simplified)
export const dependency = {
  UserRepository: {
    provide: _const.REPOSITORY.IUSER_REPOSITORY,
    useClass: UserRepository,
  },
};
```

---

## ✅ Best Practices

* Keep infrastructure logic decoupled from domain and application logic.
* Re-use the `dataSource` object to avoid multiple connection instances.
* Implement logging and error handling within services or repositories where needed.
* Always match implementations in `repositories/` and `services/` with their **interfaces** in the Domain layer.
* Keep `dependency.ts` up to date as new implementations are added.

---

This folder supports Clean Architecture principles by ensuring that domain and application layers remain agnostic to infrastructure details. Changes to external tools or services should not impact core business logic.
