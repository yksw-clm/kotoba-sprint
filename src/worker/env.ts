import type { RoomObject } from "./durable-objects/RoomObject";

export interface Env {
  ROOM_OBJECT: DurableObjectNamespace<RoomObject>;
  ASSETS: Fetcher;
}
