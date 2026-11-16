// Set kayıt defteri. Her set: { group, update(t, ctx)?, reset()?, anchors, previewCams, ... }
import { createServerRoom } from './serverRoom.js';
import { createBase } from './base.js';
export function buildSets(stage) {
  return { serverRoom: createServerRoom(stage), base: createBase(stage) };
}
