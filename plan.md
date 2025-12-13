# Plan: Full Web Support for Automaker

## Goal
Make the app work fully in web browsers while keeping Electron support. Web mode connects to a backend server (self-hosted or cloud). Electron embeds the same server locally.

## Architecture

```
┌─────────────────────────────────────┐
│         Next.js Frontend            │
│         (same code both modes)      │
└───────────────┬─────────────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
[Web Mode]            [Electron Mode]
    │                       │
HTTP/WebSocket        HTTP/WebSocket
to remote server      to localhost:3008
    │                       │
    └───────────┬───────────┘
                │
┌───────────────▼─────────────────────┐
│         Backend Server              │
│         (apps/server)               │
│  - Express + WebSocket              │
│  - All services from electron/      │
│  - Claude Agent SDK                 │
│  - File ops, Git, PTY               │
└─────────────────────────────────────┘
```

**Key insight**: Electron uses the same HTTP API - just connects to localhost instead of remote.

---

## New Package: `apps/server`

```
apps/server/
├── package.json
├── src/
│   ├── index.ts              # Express server entry
│   ├── routes/
│   │   ├── fs.ts             # File system routes
│   │   ├── agent.ts          # Agent routes
│   │   ├── sessions.ts       # Session routes
│   │   ├── auto-mode.ts      # Auto mode routes
│   │   ├── features.ts       # Features routes
│   │   ├── worktree.ts       # Git worktree routes
│   │   ├── setup.ts          # Setup/config routes
│   │   └── suggestions.ts    # Feature suggestions routes
│   ├── services/             # Moved from electron/services/
│   │   ├── agent-service.ts
│   │   ├── auto-mode-service.ts
│   │   ├── worktree-manager.ts
│   │   ├── feature-loader.ts
│   │   ├── feature-executor.ts
│   │   └── ...
│   └── lib/
│       ├── events.ts         # Event emitter for streaming
│       └── security.ts       # Path validation
```

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `apps/app/src/lib/electron.ts` | Add `HttpApiClient` class that implements `ElectronAPI` using fetch/WebSocket |
| `apps/app/electron/main.js` | Simplify to: spawn server + create window (remove 1500+ lines of IPC handlers) |
| `apps/app/electron/preload.js` | Simplify to just expose `isElectron` flag |
| `apps/app/package.json` | Remove server-side deps (Claude SDK, pty) |
| Root `package.json` | Add `apps/server` workspace |

---

## Implementation Phases

### Phase 1: Create Server Package (Foundation)
1. Create `apps/server` with Express + TypeScript setup
2. Add health check endpoint: `GET /api/health`
3. Copy one simple service (feature-loader) and create route
4. Test with curl/Postman

### Phase 2: File System API
1. Create `POST /api/fs/read`, `POST /api/fs/write`, etc.
2. Add path security (allowlist validation)
3. Update `electron.ts` with `HttpApiClient` for fs operations
4. Test: file operations work in web mode

### Phase 3: Agent API with Streaming
1. Add WebSocket server for events (`/api/events`)
2. Migrate `agent-service.js` to TypeScript
3. Create routes: `POST /api/agent/send`, etc.
4. Events stream via WebSocket instead of IPC
5. Test: chat works in web mode

### Phase 4: Sessions & Features API
1. Migrate session management routes
2. Migrate features CRUD routes
3. Test: project/feature management works

### Phase 5: Auto Mode & Worktree
1. Migrate `auto-mode-service.js` (complex - has streaming)
2. Migrate `worktree-manager.js`
3. Test: auto mode runs features in web

### Phase 6: Remaining Services
1. Spec regeneration
2. Feature suggestions
3. Setup/CLI detection
4. Model provider checks

### Phase 7: Simplify Electron
1. Update `main.js` to spawn server process + create window
2. Remove all IPC handlers
3. Electron app uses HTTP like web
4. Test: Electron still works

### Phase 8: Production Ready
1. Add authentication (API key header)
2. Configure CORS for production
3. Add `ALLOWED_PROJECT_DIRS` env for security
4. Docker setup for deployment
5. Update build scripts

---

## API Design Pattern

Convert IPC handlers to REST:

```
IPC: dialog:openDirectory  → Web: User types path, POST /api/fs/validate
IPC: fs:readFile           → POST /api/fs/read { filePath }
IPC: agent:send            → POST /api/agent/send { sessionId, message, ... }
IPC: auto-mode:start       → POST /api/auto-mode/start { projectPath }
IPC: features:getAll       → GET /api/projects/:path/features
```

Streaming via WebSocket:
```
ws://server/api/events

Events: agent:stream, auto-mode:event, suggestions:event
```

---

## Web-Specific Handling

| Feature | Electron | Web |
|---------|----------|-----|
| File picker | Native dialog | Text input + server validation |
| Open link | shell.openExternal | window.open() |
| Data directory | app.getPath('userData') | Server's DATA_DIR env |

---

## Configuration

**Server `.env`:**
```
PORT=3008
DATA_DIR=/path/to/data
ANTHROPIC_API_KEY=xxx
ALLOWED_PROJECT_DIRS=/home/user/projects
```

**Frontend `.env.local`:**
```
NEXT_PUBLIC_SERVER_URL=http://localhost:3008
```

---

## Estimated Scope

- New files: ~15-20 (server package)
- Modified files: ~5 (electron.ts, main.js, preload.js, package.jsons)
- Deleted lines: ~1500 (IPC handlers from main.js)
- Services to migrate: ~10

---

## Implementation Status

### ✅ ALL PHASES COMPLETE

- [x] **Phase 1**: Server package foundation (`apps/server`)
  - Express server with WebSocket support
  - Event emitter for streaming
  - Security module for path validation
  - Health check endpoint

- [x] **Phase 2**: HttpApiClient in frontend
  - `apps/app/src/lib/http-api-client.ts` - full implementation
  - Modified `electron.ts` to use HTTP client when not in Electron
  - No mocks - all calls go through HTTP

- [x] **Phase 3**: Agent API with streaming
  - `apps/server/src/services/agent-service.ts`
  - `apps/server/src/routes/agent.ts`
  - WebSocket streaming for responses

- [x] **Phase 4**: Sessions & Features API
  - `apps/server/src/routes/sessions.ts`
  - `apps/server/src/services/feature-loader.ts`
  - `apps/server/src/routes/features.ts`

- [x] **Phase 5**: Auto Mode & Worktree
  - `apps/server/src/services/auto-mode-service.ts` - full implementation with Claude SDK
  - `apps/server/src/routes/auto-mode.ts`
  - `apps/server/src/routes/worktree.ts`
  - `apps/server/src/routes/git.ts`

- [x] **Phase 6**: Remaining services
  - `apps/server/src/routes/setup.ts` - CLI detection, API keys, platform info
  - `apps/server/src/routes/suggestions.ts` - AI-powered feature suggestions
  - `apps/server/src/routes/spec-regeneration.ts` - spec generation from overview
  - `apps/server/src/routes/models.ts` - model providers and availability
  - `apps/server/src/routes/running-agents.ts` - active agent tracking

- [x] **Phase 7**: Simplify Electron
  - `apps/app/electron/main.js` - spawns server, minimal IPC (10 handlers for native features only)
  - `apps/app/electron/preload.js` - only native features exposed
  - Updated `electron.ts` to detect simplified mode
  - Updated `http-api-client.ts` to use native dialogs when available
  - Removed ~13,000 lines of dead code (obsolete services, agent-service.js, auto-mode-service.js)

- [x] **Phase 8**: Production ready
  - `apps/server/src/lib/auth.ts` - API key authentication middleware
  - `apps/server/Dockerfile` - multi-stage Docker build
  - `docker-compose.yml` - easy deployment configuration
  - `apps/server/.env.example` - documented configuration

---

## Additional Fixes Applied

### State Persistence
- Features now cached in localStorage via Zustand persist middleware
- Board view properly handles API failures by keeping cached data
- Theme and UI state properly persisted across refreshes

### Authentication Display
- Server now returns proper auth method names: `oauth_token_env`, `oauth_token`, `api_key_env`, `api_key`
- Settings view displays correct auth source (OAuth token, API key, subscription, etc.)
- Added support for Codex subscription detection
- Fixed "Unknown method" display issue

### Bug Fixes
- Fixed board-view.tsx crash when feature status is unknown (defaults to backlog)
- Removed "Mock IPC" label from web mode indicator
- Fixed unused imports and dependency warnings
- Updated API key authentication header support in HTTP client

---

## Summary

The architecture is simple: **one backend server, two ways to access it** (web browser or Electron shell).

- **Web users**: Connect browser to your cloud-hosted server
- **Electron users**: App spawns server locally, connects to localhost
- **Same codebase**: Frontend code unchanged, backend services extracted to standalone server
