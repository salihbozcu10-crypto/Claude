// geçici yer tutucu — set ajanı dolduracak
import * as THREE from 'three';
export function createBase(stage) {
  const group = new THREE.Group(); group.name = 'base';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x222831 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  const l = new THREE.PointLight(0x88aaff, 20, 20); l.position.set(0, 3, 2); group.add(l);
  group.add(new THREE.HemisphereLight(0x405070, 0x101010, 1));
  return { group, anchors: {}, previewCams: [{ pos: [0, 1.6, 5], target: [0, 1, 0], fov: 40 }] };
}
