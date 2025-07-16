# Gaddr Backend

Welcome to the backend of **Gaddr** — a NestJS project implementing a clean architectural folder structure based on **Vertical Slice Architecture** and **CQRS (Command Query Responsibility Segregation)**.

## ⚠️ Branching Strategy

### `main` Branch

> **🚫 DO NOT COMMIT, FETCH, OR PULL FROM THIS BRANCH**

* This is the **production** branch and is **off-limits** for all contributors.
* Any changes made directly to `main` are strictly prohibited to protect production integrity.

### `staging` Branch

* Used for **testing features** and validating merged changes.
* Endpoint for testing: [https://gaddr-backend-api.onrender.com](https://gaddr-backend-api.onrender.com/)

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

## 🎵 TikTok Integration Setup

### Prerequisites

1. **ngrok Installation**: TikTok OAuth requires HTTPS callbacks. Install ngrok for local development:
   ```bash
   # Install ngrok (macOS)
   brew install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **TikTok Developer Account**: 
   - Create a TikTok Developer account at [https://developers.tiktok.com/](https://developers.tiktok.com/)
   - Create a new app and configure OAuth settings

### Local Development Setup

1. **Start ngrok tunnel**:
   ```bash
   ngrok http 3000
   ```
   
2. **Copy the HTTPS URL** from ngrok output (e.g., `https://abc123.ngrok-free.app`)

3. **Update TikTok App Settings**:
   - Go to your TikTok app settings
   - Set redirect URI to: `https://your-ngrok-url.ngrok-free.app/api/v1/integrations/tiktok/connect-callback`

4. **Environment Configuration**:
   ```env
   TIKTOK_CLIENT_ID=your_tiktok_client_id
   TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
   TIKTOK_REDIRECT_URI=https://your-ngrok-url.ngrok-free.app/api/v1/integrations/tiktok/connect-callback
   ```

### TikTok Authentication Flow

1. **Initiate Connection**:
   ```bash
   GET /api/v1/integrations/tiktok/connect
   Authorization: Bearer {your_access_token}
   ```
   
   Response:
   ```json
   {
     "authorizeURL": "https://www.tiktok.com/v2/auth/authorize/..."
   }
   ```

2. **User Authorization**:
   - User visits the `authorizeURL` in their browser
   - Authorizes the app on TikTok
   - Gets redirected to the callback URL

3. **Get Profile**:
   ```bash
   GET /api/v1/integrations/tiktok/profile
   Authorization: Bearer {your_access_token}
   ```

4. **Import Content**:
   ```bash
   POST /api/v1/integrations/tiktok/import
   Authorization: Bearer {your_access_token}
   ```

### Important Notes

- **User Type Requirement**: TikTok endpoints require `UserType.User` (not Guest)
- **ngrok Stability**: Keep ngrok running during development
- **HTTPS Only**: TikTok OAuth only works with HTTPS URLs
- **Rate Limiting**: Built-in rate limiting protects against API limits

### 🧠 Architecture Overview:

* Framework: NestJS
* Architecture Style: Clean Architecture
* Structural Pattern: Vertical Slice Architecture
* Pattern: CQRS (Command Query Responsibility Segregation)

This structure promotes separation of concerns, scalability, and maintainability.

### 📂 Folder Structure Rules

The folder structure of this project follows Clean Architecture principles, with a focus on Vertical Slice Architecture for feature modularity and CQRS for separating command and query concerns.

#### `Core` Layer (src/core)
Purpose: The Core Layer is where all the business logic and use cases live. This layer is independent of any external dependencies.

Structure Rules:

Contains business logic, services, and application-specific rules that do not depend on frameworks or databases.

Services here should have no dependencies on external libraries (e.g., database, frameworks).

Exceptions and utility functions relevant to the application go here.

#### `Domain` Layer (src/domain)
Purpose: The Domain Layer encapsulates the business model of the application. It defines entities, contracts, and domain logic.

Structure Rules:

Contains entities, contracts, and domain services that represent the core of the business.

Repositories in this layer are interfaces and will be implemented in the Infrastructure Layer.

The domain model is independent of any frameworks or technologies (e.g., databases, external APIs).

#### `Infrastructure` Layer (src/infrastructure)
Purpose: The Infrastructure Layer interacts with external dependencies such as databases, external APIs, and third-party services.

Structure Rules:

Implements repositories from the Domain Layer.

Database integration, external APIs, and any third-party services are implemented here.

Should not contain business logic, but only concrete implementations for services and repositories.

#### `Presentation` Layer (Vertical Slice) (src/features)
Purpose: The Presentation Layer follows the Vertical Slice Architecture, meaning each feature is fully contained within a slice, including its endpoints and handler.

Structure Rules:

Each feature is isolated within its own folder (e.g., user, auth, integrations).

Inside each feature folder, you’ll find the endpoint(controller) and handler for that feature.

All feature-specific logic is contained in one place, making it easier to manage and scale features independently.

This structure follows CQRS, meaning commands (write operations) and queries (read operations) are separated.

## 📜 Naming Conventions
`Classes`:

Use PascalCase for class names and types (e.g., CreateUserCommand).

`Functions`:

Use camelCase for function names and methods (e.g., createUser()).

`Files and Directories`:

Use lowercase with hyphenated filenames for directories and files (e.g., create-user.endpoint.ts).

DTOs:

For request/response data objects, append Model to the name (e.g., CreateUserModel).
