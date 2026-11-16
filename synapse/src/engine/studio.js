// Önizleme için stüdyo ışıkları (karakter/aksesuar inceleme). Bölümde kullanılmaz.
import * as THREE from 'three';
export function studioLights(scene) {
  const group = new THREE.Group(); group.name = 'studio';
  const key = new THREE.SpotLight(0xffe2c8, 14, 12, 0.7, 0.6, 1.5); key.position.set(1.8, 2.6, 2.4); key.target.position.set(0, 1.2, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  const fill = new THREE.PointLight(0x7fb0ff, 2.0, 8, 1.5); fill.position.set(-2.2, 1.6, 1.8);
  const rim = new THREE.SpotLight(0x5fe0ff, 16, 10, 0.8, 0.5, 1.5); rim.position.set(-1.2, 2.2, -2.2); rim.target.position.set(0, 1.2, 0);
  const hemi = new THREE.HemisphereLight(0x6080a0, 0x202020, 0.8);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x2a3444, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  group.add(key, key.target, fill, rim, rim.target, hemi, floor);
  scene.add(group);
  return { group, key, fill, rim };
}
