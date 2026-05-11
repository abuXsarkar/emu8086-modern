- **Classroom worker: persist room state across DO eviction**.
  Symptom: teacher creates a room, gets `created`, sees `code 1000
  "room state lost"` close, then any student joining the same code
  gets `room_not_found`. Cloudflare Durable Objects can be evicted
  from memory between requests; the WebSocket Hibernation API keeps
  the sockets alive but in-memory state in `this.sessions` is
  wiped. `rehydrateFromHibernatedSockets` then closes the teacher's
  socket because the room isn't in the (empty) sessions map.
  Add `Room.toJSON()` / static `Room.fromJSON()` and have the
  Durable Object write each room to `state.storage` after every
  mutation (handler, disconnect, alarm tick) and load all rooms on
  construct. `closeRoom` and the alarm reaper delete the persisted
  row. Roundtrip coverage in `room.test.ts`.
