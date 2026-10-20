import * as THREE from "three";
import {
  configureTurret10000Renderer,
  createTurret10000Environment,
  createTurret10000LookDevLights,
  createTurret10000Model,
  frameTurret10000Camera,
} from "../src/createTurret10000Model";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1024, 1024);
renderer.shadowMap.enabled = true;
configureTurret10000Renderer(renderer);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2d31);
scene.environment = createTurret10000Environment(renderer);
scene.add(createTurret10000LookDevLights("reference"));

const model = createTurret10000Model();
scene.add(model);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.92, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
frameTurret10000Camera(camera, model, { azimuthDeg: 38, elevationDeg: 16, margin: 1.3 });
renderer.render(scene, camera);
