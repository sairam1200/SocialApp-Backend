# Domain Layer

The **Domain Layer** represents the core business logic and rules of the application. It defines entities, contracts (DTOs), enums, and mapping logic that model the business domain independently of any external technology.

This layer should be completely agnostic to infrastructure, frameworks, and UI concerns.

---

## 📁 Folder Structure

### `contracts/`
This folder contains **Data Transfer Objects (DTOs)** that define the structure and rules for input/output between layers (usually between Application/Infrastructure and Presentation).

- DTOs follow a **chained extension model**:
  - `CreateUserModel` defines required fields to create a user.
  - `UpdateUserModel` extends `CreateUserModel` to allow partial updates.
  - `UserModel` extends `UpdateUserModel` and adds final output fields.

- **File Naming Convention:**
  - All contracts follow `{contract-name}.model.ts` format.
  - Example: `user.model.ts`

This chaining promotes reuse, readability, and separation of creation, update, and full object shapes.

---

### `entities/`
This folder contains all **TypeORM-based entity definitions** representing the database structure.

- Entities reflect the persistent domain objects with decorators like `@Entity`, `@Column`, etc.
- **File Naming Convention:**
  - All entity files follow `{entity}.entity.ts` format.
  - Example: `user.entity.ts`

#### `entities/base/`
This folder holds **base entity logic** shared across all domain entities.

- `baseEntity.ts`:
  - Inherits from `TypeORMBaseEntity`
  - Defines a shared `id` property used across all domain entities
  - Implements auditing fields like `createdOn`, `createdBy`, `lastModifiedOn`, `lastModifiedBy`
  - Includes a private `_currentUser?: string` field for tracking the user making the change

- Hooks automatically apply auditing on insert and update:

```ts
@BeforeInsert()
private beforeInsert() {
  this.createdOn = new Date();
  this.createdBy = this._currentUser;
  this.lastModifiedBy = this._currentUser;
}

@BeforeUpdate()
private beforeUpdate() {
  this.lastModifiedBy = this._currentUser;
  this.lastModifiedOn = new Date();
}
```

---

### `mappers/`
This folder contains **mapping functions or classes** that convert between domain entities and DTOs (contracts).

- Ensures transformation between database entities and clean response/request models.
- Keeps domain logic pure and separate from infrastructure or presentation concerns.

---

### `enum.ts`
This file holds **application-wide enums** used within contracts, entities, and business logic.

- **Enum Naming:**
  - Enums use **PascalCase** for enum names.
  - Enum values use **dash-case** (lowercase with hyphens).

```ts
export enum NotificationStatus {
  InProgress = 'in-progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Failed = 'failed',
}
```

- Enums promote consistency and validation across layers (e.g., status fields).

---

## ✅ Best Practices

- Keep the domain pure and decoupled from NestJS, TypeORM infrastructure-specific logic.
- Always define contracts with a clear extension chain (`Create > Update > Full` model).
- Use mappers to isolate conversion logic between layers.
- Maintain clear naming conventions for readability and consistency.
- Ensure base entities handle all common auditing needs.

---

This layer forms the foundation of the system's core logic and should change the least. It is the most stable and protected layer in Clean Architecture.
