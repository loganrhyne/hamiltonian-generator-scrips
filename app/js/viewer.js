// Three.js preview of the assembled lamp: a translucent paper shade with the
// Hamiltonian wall ribbon extruded inward, lit from a warm bulb at the centre.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildWallMesh } from './geometry.js';

export class LampViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 50000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // lighting: warm bulb inside the lamp + cool fill so paper reads as paper
    this.bulb = new THREE.PointLight(0xffb45e, 1, 0, 1.6);
    this.scene.add(this.bulb);
    this.scene.add(new THREE.AmbientLight(0x223344, 1.2));
    const fill = new THREE.DirectionalLight(0x88aacc, 0.5);
    fill.position.set(1, 1, 1);
    this.scene.add(fill);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._materials = {
      wall: new THREE.MeshStandardMaterial({
        color: 0xf3ead8,
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      shade: new THREE.MeshStandardMaterial({
        color: 0xffe9c4,
        emissive: 0xffb45e,
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.22,
        roughness: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      rim: new THREE.LineBasicMaterial({ color: 0x7fb3e0, transparent: true, opacity: 0.6 }),
    };

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    const tick = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas.parentElement;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Rebuild the model from a cycle + physical params. Returns build ms. */
  update(cycle, { cellW, cellH, wallHeight }) {
    const t0 = performance.now();

    // dispose previous build
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
    }

    const mesh = buildWallMesh(cycle, { cellW, cellH, wallHeight });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();
    this.group.add(new THREE.Mesh(geo, this._materials.wall));

    // translucent outer shade
    const H = mesh.heightMM;
    const shadeGeo = new THREE.CylinderGeometry(mesh.radius, mesh.radius, H, 96, 1, true);
    shadeGeo.translate(0, H / 2, 0);
    this.group.add(new THREE.Mesh(shadeGeo, this._materials.shade));

    // rim circles top & bottom
    for (const y of [0, H]) {
      const rimGeo = new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 97 }, (_, i) => {
          const a = (2 * Math.PI * i) / 96;
          return new THREE.Vector3(mesh.radius * Math.cos(a), y, mesh.radius * Math.sin(a));
        }),
      );
      this.group.add(new THREE.Line(rimGeo, this._materials.rim));
    }

    // bulb in the middle, sized to the lamp
    this.bulb.position.set(0, H / 2, 0);
    this.bulb.intensity = mesh.radius * mesh.radius * 0.9;

    // frame the camera
    const size = Math.max(H, mesh.radius * 2);
    this.controls.target.set(0, H / 2, 0);
    this.camera.position.set(size * 1.1, H * 0.72, size * 1.25);
    this.camera.near = size / 100;
    this.camera.far = size * 50;
    this.camera.updateProjectionMatrix();
    this.controls.update();

    return performance.now() - t0;
  }
}
