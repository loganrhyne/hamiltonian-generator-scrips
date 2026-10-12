// Three.js preview of the assembled lamp: a translucent paper shade with the
// Hamiltonian wall ribbon extruded inward, lit from a warm bulb at the centre.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildWallMesh } from './geometry.js';
import { prismMapper } from './panels.js';

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
      walnut: new THREE.MeshStandardMaterial({
        color: 0x7a5236, roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
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

  _clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
    }
  }

  _frame(H, radius) {
    this.bulb.position.set(0, H / 2, 0);
    this.bulb.intensity = radius * radius * 0.9;
    const size = Math.max(H, radius * 2);
    this.controls.target.set(0, H / 2, 0);
    this.camera.position.set(size * 1.1, H * 0.72, size * 1.25);
    this.camera.near = size / 100;
    this.camera.far = size * 50;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /**
   * Flat-panel prism (panels.buildPanels output): the kept path as
   * translucent acetate, the cut-away gaps open, wood strips standing inward.
   * Returns build ms.
   */
  updatePanels(build) {
    const t0 = performance.now();
    this._clear();
    const map = prismMapper(build);
    const skin = [];
    const wood = [];
    const quad = (out, a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
    build.panels.forEach((pn, i) => {
      for (const rc of pn.keep) {
        quad(skin,
          map(i, rc.x, rc.y), map(i, rc.x + rc.w, rc.y),
          map(i, rc.x + rc.w, rc.y + rc.h), map(i, rc.x, rc.y + rc.h));
      }
      const d = build.strip;
      for (const rc of pn.walls) {
        const x0 = rc.x; const x1 = rc.x + rc.w; const y0 = rc.y; const y1 = rc.y + rc.h;
        const c = (u, v, z) => map(i, u, v, z);
        // four long sides + top + two ends (the face on the acetate is hidden)
        quad(wood, c(x0, y0, d), c(x1, y0, d), c(x1, y1, d), c(x0, y1, d));
        quad(wood, c(x0, y0, 0), c(x1, y0, 0), c(x1, y0, d), c(x0, y0, d));
        quad(wood, c(x1, y1, 0), c(x0, y1, 0), c(x0, y1, d), c(x1, y1, d));
        quad(wood, c(x0, y1, 0), c(x0, y0, 0), c(x0, y0, d), c(x0, y1, d));
        quad(wood, c(x1, y0, 0), c(x1, y1, 0), c(x1, y1, d), c(x1, y0, d));
      }
    });
    const mesh = (arr, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    };
    this.group.add(mesh(skin, this._materials.shade));
    this.group.add(mesh(wood, this._materials.walnut));

    // panel outlines: top and bottom rims plus the prism corners
    const H = build.panelH;
    const P = build.panelCount;
    const corner = (k, v) => new THREE.Vector3(...map(k % P, 0, v));
    for (const v of [0, H]) {
      const pts = Array.from({ length: P + 1 }, (_, k) => corner(k, v));
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this._materials.rim));
    }
    const posts = [];
    for (let k = 0; k < P; k++) posts.push(corner(k, 0), corner(k, H));
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(posts), this._materials.rim));

    this._frame(H, build.acrossCorners / 2);
    return performance.now() - t0;
  }

  /** Rebuild the model from a cycle + physical params. Returns build ms. */
  update(cycle, { cellW, cellH, wallHeight }) {
    const t0 = performance.now();
    this._clear();

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

    this._frame(H, mesh.radius);

    return performance.now() - t0;
  }
}
