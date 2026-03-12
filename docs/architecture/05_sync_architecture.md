# Sync Architecture

Okkey uses **event log synchronization**.

This enables:

- realtime sync
- offline support
- deterministic state reconstruction

---

## Sync Model

Synchronization is event-based.
```text
events
↓
stored
↓
replayed
↓
state rebuilt
```

---

## Event Flow
```text
Client
↓
create event
↓
send to API
↓
store in event log
↓
broadcast to other clients
```

---

## Transport

WebSocket is used for realtime sync.

Fallback: HTTP polling

---

## Event Types

Main events:
- ITEM_CREATE
- ITEM_UPDATE
- ITEM_DELETE
- VAULT_CREATE
- VAULT_SHARE
- VAULT_KEY_ROTATION
- DEVICE_ADDED

---

## Event Structure
```text
event_id
event_type
actor_id
vault_id
payload
created_at
```

Payload is always encrypted.

---

## Local Database

Clients use local storage.

- Web: IndexedDB
- Mobile/Desktop: SQLite

---

## Sync Flow
```text
open app
↓
load local DB
↓
fetch new events
↓
apply events
↓
update state
```

---

## Offline Mode

User can work offline.
```text
local changes
↓
stored locally
↓
queued events
```

After reconnect:
- upload events
- sync state

---

## Conflict Resolution

Uses:
- event ordering
- version numbers

In most cases: last write wins

---

## Event Security

Event payloads: encrypted client-side

Server cannot read contents.
