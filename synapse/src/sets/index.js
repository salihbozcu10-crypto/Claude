// Set kayıt defteri. Her set: { group, update(t, ctx)?, reset()?, anchors, previewCams, ... }
import { createServerRoom } from './serverRoom.js';
import { createBase } from './base.js';
import { createTitle } from './title.js';
export function buildSets(stage) {
  return { serverRoom: createServerRoom(stage), base: createBase(stage), title: createTitle(stage) };
}
