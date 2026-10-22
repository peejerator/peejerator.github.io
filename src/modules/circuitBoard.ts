import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBoardLayout, STATION_PITCH, type BoardPart, type BoardStop } from './circuitLayout';

const mix = THREE.MathUtils.lerp;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const BOARD_WIDTH = 36;

export interface CircuitBoard {
  resize(width: number, height: number): void;
  render(position: number, time: number, paused: boolean): void;
  dispose(): void;
}

/** Real geometry, depth testing and physically based surfaces for the PCB. */
export function createCircuitBoard(canvas: HTMLCanvasElement, stops: BoardStop[]): CircuitBoard {
  const mobile = window.innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#091411');
  scene.fog = new THREE.Fog('#091411', 24, 47);
  const camera = new THREE.PerspectiveCamera(46, 1, .1, 75);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .55;
  room.dispose();
  pmrem.dispose();
  const key = new THREE.DirectionalLight('#fff1d8', 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -14;
  key.shadow.camera.right = key.shadow.camera.top = 14;
  key.shadow.camera.near = .5;
  key.shadow.camera.far = 45;
  key.shadow.normalBias = .025;
  key.shadow.bias = -.00015;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#a9d8e7', 1.1);
  scene.add(fill, fill.target);
  scene.add(new THREE.HemisphereLight('#d3e9e9', '#0b1711', .45));

  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const labelMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const groups: THREE.Group[] = [];
  const parts = createBoardLayout(stops);
  const material = (color: string, metalness: number, roughness: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    materials.push(m);
    return m;
  };
  const epoxy = material('#1a1c1e', .05, .82);
  const ceramic = material('#a38c63', .02, .53);
  const ferrite = material('#36383a', .15, .68);
  const nickel = material('#bbc1c4', .95, .27);
  const solder = material('#b4b9ba', .9, .31);
  const gold = material('#ceaa55', .94, .24);
  const aluminium = material('#c9cdd0', .9, .29);
  const sleeve = material('#182327', .35, .49);
  const copper = material('#b87138', .88, .29);
  const black = material('#090d10', .04, .45);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0a2433', metalness: .2, roughness: .035, clearcoat: 1, clearcoatRoughness: .025 });
  materials.push(glass);

  function rounded(w: number, h: number, d: number, radius: number): THREE.BufferGeometry {
    const id = [w, h, d, radius].join(',');
    let geo = geometryCache.get(id);
    if (!geo) {
      // Tiny lead details need hard faces; rounding them adds invisible polygons.
      geo = Math.min(w, h, d) < .06
        ? new THREE.BoxGeometry(w, h, d)
        : new RoundedBoxGeometry(w, h, d, 2, radius);
      geometryCache.set(id, geo);
    }
    return geo;
  }
  function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, radius = .015, shadow = true): THREE.Mesh {
    return mesh(parent, rounded(w, h, d, Math.min(radius, w / 3, h / 3, d / 3)), mat, x, y, z, shadow);
  }
  function cylinder(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, height: number, mat: THREE.Material): THREE.Mesh {
    const id = `cylinder,${radius},${height}`;
    let geo = geometryCache.get(id);
    if (!geo) { geo = new THREE.CylinderGeometry(radius, radius, height, 40); geometryCache.set(id, geo); }
    return mesh(parent, geo, mat, x, y, z);
  }
  function torus(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, tube: number, mat: THREE.Material): THREE.Mesh {
    const id = `torus,${radius},${tube}`;
    let geo = geometryCache.get(id);
    if (!geo) { geo = new THREE.TorusGeometry(radius, tube, 8, 48); geometryCache.set(id, geo); }
    const m = mesh(parent, geo, mat, x, y, z);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  function textureFrom(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures.push(texture);
    return texture;
  }
  function label(parent: THREE.Object3D, lines: string[], x: number, y: number, z: number, w: number, d: number, fontSize = 32, color = '#b9bcb4'): void {
    const id = JSON.stringify([lines, w, d, fontSize, color]);
    let mat = labelMaterials.get(id);
    if (!mat) {
      const c = document.createElement('canvas');
      // Match the physical aspect ratio so glyphs are never stretched. Text has
      // its own texel density instead of sharing a full board's surface map.
      c.width = THREE.MathUtils.ceilPowerOfTwo(Math.min(2048, Math.max(128, w * 384)));
      c.height = Math.max(32, Math.ceil(c.width * d / w));
      const g = c.getContext('2d')!;
      const padding = c.width * .025;
      let size = fontSize / 256 * c.height;
      g.font = `${size}px monospace`;
      const longest = Math.max(...lines.map(line => g.measureText(line).width));
      size *= Math.min(1, (c.width - 2 * padding) / Math.max(1, longest), c.height * .86 / (size * lines.length * 1.35));
      g.font = `${size}px monospace`;
      g.fillStyle = color;
      g.textBaseline = 'middle';
      const lineHeight = size * 1.35;
      const firstLine = c.height / 2 - (lines.length - 1) * lineHeight / 2;
      lines.forEach((line, i) => g.fillText(line, padding, firstLine + i * lineHeight));
      mat = new THREE.MeshBasicMaterial({ map: textureFrom(c), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
      labelMaterials.set(id, mat);
      materials.push(mat);
    }
    const plate = mesh(parent, new THREE.PlaneGeometry(w, d), mat, x, y, z, false);
    plate.rotation.x = -Math.PI / 2;
    plate.receiveShadow = false;
    plate.renderOrder = 2;
  }
  // Formed gull-wing leads: a flat solder foot, rising knee and package entry.
  function lead(parent: THREE.Object3D, x: number, z: number, angle: number, length = .32, width = .055): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z); group.rotation.y = angle; parent.add(group);
    box(group, length - .07, .028, 0, .22, .045, width * 1.7, solder, .018, false);
    box(group, length - .04, .045, 0, .13, .022, width, nickel, .008, false);
    const knee = box(group, length / 2, .105, 0, length * .52, .025, width, nickel, .008, false);
    knee.rotation.z = -.54;
    box(group, .035, .155, 0, .11, .025, width, nickel, .008, false);
  }
  function qfp(parent: THREE.Object3D, x: number, z: number, w: number, d: number, name: string, pins = 24, markings = true): void {
    box(parent, x, .19, z, w, .23, d, epoxy, .055);
    // Slight mould parting line and shallow pin-one indicator.
    box(parent, x, .105, z, w + .008, .018, d + .008, black, .035);
    cylinder(parent, x - w / 2 + .18, .308, z + d / 2 - .18, .045, .004, ferrite);
    for (let j = 0; j < pins; j++) {
      const t = (j - (pins - 1) / 2) / pins;
      lead(parent, x + w / 2, z + t * (d - .25), 0);
      lead(parent, x - w / 2, z + t * (d - .25), Math.PI);
      lead(parent, x + t * (w - .25), z + d / 2, -Math.PI / 2);
      lead(parent, x + t * (w - .25), z - d / 2, Math.PI / 2);
    }
    if (markings) label(parent, [name, 'PC / CS + EE', '26W42  ·  REV.B'], x, .309, z, w * .8, d * .55, 42);
  }
  function passive(parent: THREE.Object3D, p: BoardPart, z: number): void {
    const bodyW = p.w * .63, bodyD = p.d * .72;
    for (const sign of [-1, 1]) {
      box(parent, p.x + sign * p.w * .33, .025, z, p.w * .3, .04, p.d, solder, .025, false);
      box(parent, p.x + sign * bodyW * .37, .075, z, bodyW * .3, .1, bodyD, nickel, .012);
    }
    box(parent, p.x, .077, z, bodyW * .63, .11, bodyD, p.kind === 'mlcc' ? ceramic : epoxy, .02);
    if (p.kind === 'resistor') label(parent, [p.label], p.x, .135, z, bodyW * .58, bodyD * .8, 75);
  }
  function component(parent: THREE.Object3D, p: BoardPart, stop: BoardStop): void {
    const x = p.x, z = -(p.y - stop.y);
    if (p.kind === 'qfp') qfp(parent, x, z, 3.3, 3.3, p.label, 28);
    else if (p.kind === 'dual') {
      qfp(parent, x - 1.04, z, 1.15, 2.65, 'CS', 10);
      qfp(parent, x + 1.04, z, 1.15, 2.65, 'EE', 10);
    } else if (p.kind === 'soic') {
      box(parent, x, .17, z, p.w * .58, .25, p.d * .84, epoxy, .045);
      for (let i = 0; i < 4; i++) {
        const pz = z + (i - 1.5) * p.d * .2;
        lead(parent, x + p.w * .29, pz, 0, .22, .09);
        lead(parent, x - p.w * .29, pz, Math.PI, .22, .09);
      }
      label(parent, [p.label, p.reference], x, .301, z, p.w * .5, p.d * .55, 43);
    } else if (p.kind === 'resistor' || p.kind === 'mlcc') passive(parent, p, z);
    else if (p.kind === 'bga') {
      // BGA substrate, package and a satin metal heat spreader.
      box(parent, x, .09, z, 3.8, .12, 3.8, material('#224c3e', .15, .61), .035);
      for (const side of [-1, 1]) for (let i = 0; i < 20; i++) {
        box(parent, x + side * 1.83, .16, z + (i - 9.5) * .16, .05, .018, .06, gold, .004, false);
      }
      box(parent, x, .23, z, 3.25, .19, 3.25, epoxy, .07);
      box(parent, x, .365, z, 2.9, .14, 2.9, aluminium, .07);
      label(parent, ['MAC ARRAY', '3 × 3 / 100 MHz', 'POWER-AWARE RTL'], x, .439, z, 2.45, 1.5, 34, '#44494a');
    } else if (p.kind === 'sensor') {
      qfp(parent, x, z, 3.25, 3.25, 'VISION / ISP', 20, false);
      // The lens and its mount occupy the rear of the package; keep the marking
      // entirely on the exposed front strip rather than beneath the lens.
      label(parent, ['VISION / ISP'], x, .309, z + 1.07, 2.6, .46, 160);
      box(parent, x, .35, z - .25, 1.7, .2, 1.7, black, .09);
      cylinder(parent, x, .72, z - .25, .73, .6, black);
      for (let i = 0; i < 5; i++) torus(parent, x, .51 + i * .1, z - .25, .73, .025, ferrite);
      torus(parent, x, 1.03, z - .25, .62, .05, ferrite);
      torus(parent, x, 1.034, z - .25, .64, .012, nickel);
      cylinder(parent, x, 1.025, z - .25, .57, .015, black);
      const lens = mesh(parent, new THREE.SphereGeometry(.55, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass, x, 1.04, z - .25);
      lens.scale.y = .14;
    } else if (p.kind === 'electrolytic') {
      const radius = p.w * .43, h = p.w * 1.4;
      box(parent, x, .04, z, p.w, .06, p.d, black, .045);
      cylinder(parent, x, h / 2 + .08, z, radius, h, sleeve);
      torus(parent, x, .1, z, radius, .025, aluminium);
      cylinder(parent, x, h + .085, z, radius * .91, .035, aluminium);
      torus(parent, x, h + .1, z, radius * .92, .018, nickel);
      // Scored pressure vent stamped into the aluminium lid.
      box(parent, x, h + .106, z, radius * 1.3, .006, .017, ferrite, .003, false);
      box(parent, x, h + .106, z, .017, .006, radius * 1.3, ferrite, .003, false);
      label(parent, [p.label, '16V'], x, h + .112, z + radius * .43, radius * 1.2, radius * .5, 60);
    } else if (p.kind === 'inductor') {
      box(parent, x, .055, z, 1.15, .075, 1.05, solder, .05, false);
      box(parent, x, .25, z, 1.03, .4, 1.03, ferrite, .13);
      torus(parent, x, .45, z, .33, .105, ferrite);
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2;
        const coil = torus(parent, x + Math.cos(angle) * .33, .47, z + Math.sin(angle) * .33, .105, .025, copper);
        coil.rotation.set(0, -angle, Math.PI / 2);
      }
    } else if (p.kind === 'header') {
      const main = p.w > 2;
      const rows = main ? 8 : 6, span = main ? 2.7 : 2.75;
      box(parent, x, .22, z, main ? 1.2 : .78, .36, span + .18, black, .025);
      for (let i = 0; i < rows; i++) for (const sign of [-1, 1]) {
        const px = x + sign * .25, pz = z + (i / (rows - 1) - .5) * span;
        box(parent, px, .035, pz, .21, .045, .22, solder, .04, false);
        box(parent, px, .59, pz, .075, 1.05, .075, gold, .012);
      }
    } else if (p.kind === 'usb') {
      // USB-A style metal shell, dark socket and central contact tongue.
      box(parent, x, .09, z, 3.4, .15, 2.3, black, .08);
      box(parent, x, .18, z, 3.6, .09, 2.35, nickel, .06);
      box(parent, x, 1.0, z, 3.6, .08, 2.35, nickel, .06);
      for (const side of [-1, 1]) box(parent, x + side * 1.76, .58, z, .08, .85, 2.35, nickel, .055);
      box(parent, x, .58, z - 1.12, 3.45, .78, .1, nickel, .03);
      box(parent, x, .59, z + .15, 2.7, .16, 1.55, black, .06);
      for (let i = 0; i < 12; i++) box(parent, x + (i - 5.5) * .2, .682, z + .28, .095, .025, 1.13, gold, .008, false);
      label(parent, ['USB / I/O'], x, 1.045, z, 2.4, 1.1, 44, '#44494a');
    }
  }

  function pcbTexture(stop: BoardStop, station: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = mobile ? 1024 : 2048; c.height = c.width / 2;
    const g = c.getContext('2d')!;
    g.fillStyle = '#173c31'; g.fillRect(0, 0, c.width, c.height);
    let seed = 341 + station;
    const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pixels = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const noise = (random() - .5) * 7;
      pixels.data[i] += noise; pixels.data[i + 1] += noise; pixels.data[i + 2] += noise;
    }
    g.putImageData(pixels, 0, 0);
    const px = (x: number): number => (x + BOARD_WIDTH / 2) / BOARD_WIDTH * c.width;
    const py = (y: number): number => (.5 - y / STATION_PITCH) * c.height;
    function trace(points: number[][], color = '#496750', width = .027): void {
      g.beginPath(); points.forEach((p, i) => i ? g.lineTo(px(p[0]), py(p[1])) : g.moveTo(px(p[0]), py(p[1])));
      g.strokeStyle = color; g.lineWidth = width / BOARD_WIDTH * c.width; g.lineJoin = 'round'; g.stroke();
    }
    function via(x: number, y: number): void {
      const radius = .046 / BOARD_WIDTH * c.width;
      g.beginPath(); g.arc(px(x), py(y), radius, 0, Math.PI * 2); g.fillStyle = '#aaa06b'; g.fill();
      g.beginPath(); g.arc(px(x), py(y), radius * .45, 0, Math.PI * 2); g.fillStyle = '#061b14'; g.fill();
    }
    // Parallel fan-out lanes make 45-degree turns; solder mask covers the copper.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 22; i++) {
        const y = (i - 10.5) * .125;
        const spread = (i - 10.5) * .17;
        const endX = stop.x + side * (7.8 + (i % 4) * .12);
        const elbow = stop.x + side * (2.65 + Math.abs(i - 10.5) * .025);
        trace([[stop.x + side * 1.92, y], [elbow, y], [elbow + side * Math.abs(spread), y + spread], [endX, y + spread]]);
        via(endX, y + spread);
      }
      for (let i = 0; i < 17; i++) {
        const x = stop.x + (i - 8) * .18;
        trace([[x, side * 1.95], [x, side * 3.2], [x + .45, side * 3.65], [x + .45, side * 4.7]], '#48624b', .022);
        via(x + .45, side * 4.7);
      }
      // Ground stitching and reference designators at regular board intervals.
      for (let j = 0; j < 28; j++) via(side * 14.5, -5.3 + j * .39);
    }
    for (const p of parts.filter(p => p.station === station)) {
      const localY = p.y - stop.y;
      g.strokeStyle = '#b3c5a885'; g.lineWidth = Math.max(1, .014 / BOARD_WIDTH * c.width);
      const gap = .1;
      g.strokeRect(px(p.x - p.w / 2 - gap), py(localY + p.d / 2 + gap), (p.w + gap * 2) / BOARD_WIDTH * c.width, (p.d + gap * 2) / STATION_PITCH * c.height);
      // A dark, diffuse footprint gives indirect contact occlusion under parts.
      const ao = g.createRadialGradient(px(p.x), py(localY), 0, px(p.x), py(localY), Math.max(p.w, p.d) / BOARD_WIDTH * c.width * .65);
      ao.addColorStop(0, '#020b0780'); ao.addColorStop(.65, '#020b0740'); ao.addColorStop(1, '#020b0700');
      g.fillStyle = ao; g.fillRect(px(p.x - p.w), py(localY + p.d), p.w * 2 / BOARD_WIDTH * c.width, p.d * 2 / STATION_PITCH * c.height);
    }
    return textureFrom(c);
  }

  // Fine, repeating surface grain catches light without a visible engineering grid.
  const grainCanvas = document.createElement('canvas'); grainCanvas.width = grainCanvas.height = 128;
  const grainContext = grainCanvas.getContext('2d')!;
  const grainPixels = grainContext.createImageData(128, 128);
  for (let i = 0; i < grainPixels.data.length; i += 4) {
    const v = 100 + ((i * 37 % 107) / 107) * 55;
    grainPixels.data[i] = grainPixels.data[i + 1] = grainPixels.data[i + 2] = v; grainPixels.data[i + 3] = 255;
  }
  grainContext.putImageData(grainPixels, 0, 0);
  const grain = textureFrom(grainCanvas); grain.colorSpace = THREE.NoColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(45, 16);

  stops.forEach((stop, station) => {
    const group = new THREE.Group(); group.position.z = -stop.y; groups.push(group); scene.add(group);
    const mask = new THREE.MeshPhysicalMaterial({ map: pcbTexture(stop, station), roughness: .48, metalness: .12, clearcoat: .36, clearcoatRoughness: .48, bumpMap: grain, bumpScale: .004 });
    materials.push(mask);
    const board = mesh(group, new THREE.PlaneGeometry(BOARD_WIDTH, STATION_PITCH), mask, 0, 0, 0, false);
    board.rotation.x = -Math.PI / 2;
    parts.filter(p => p.station === station).forEach(p => component(group, p, stop));
    // Silkscreen lettering is independent of the coarse solder-mask texture.
    // Its resolution stays high as the camera approaches the board.
    label(group, [`PC-${String(station + 1).padStart(2, '0')}  /  ${stop.name}`], stop.x + 1.9, .014, 3.55, 8, .62, 180, '#c7d1bd');
    label(group, ['PATRICK CANADY  ·  CS / EE  ·  REV B  ·  2026'], stop.x + 1.9, .014, 4.1, 8, .3, 180, '#91a88b');
    parts.filter(p => p.station === station).forEach(p => {
      const textWidth = Math.max(.27, p.reference.length * .1);
      label(group, [p.reference], p.x - p.w / 2 + textWidth / 2, .014, -(p.y - stop.y + p.d / 2 + .25), textWidth, .19, 190, '#c1cbb5');
    });
    // Merge static meshes by material to keep hundreds of leads inexpensive.
    group.updateMatrixWorld(true);
    const batches = new Map<string, { material: THREE.Material; castShadow: boolean; geometries: THREE.BufferGeometry[] }>();
    const remove: THREE.Mesh[] = [];
    const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
    group.traverse(child => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
      if (child === board) return;
      const key = `${child.material.uuid}/${child.castShadow}`;
      let batch = batches.get(key);
      if (!batch) { batch = { material: child.material, castShadow: child.castShadow, geometries: [] }; batches.set(key, batch); }
      const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld));
      batch.geometries.push(geo); remove.push(child);
    });
    remove.forEach(m => m.removeFromParent());
    batches.forEach(batch => {
      const merged = mergeGeometries(batch.geometries, false);
      batch.geometries.forEach(geo => geo.dispose());
      if (!merged) throw new Error('Unable to batch PCB geometry');
      const m = mesh(group, merged, batch.material, 0, 0, 0, batch.castShadow);
      m.receiveShadow = true;
    });
  });

  const routePoints: THREE.Vector3[] = [];
  stops.forEach((stop, i) => {
    const x = stop.x + stop.side * 3.65;
    if (i) {
      const prev = stops[i - 1];
      routePoints.push(new THREE.Vector3(prev.x + prev.side * 3.65, .018, -stop.y + 6.8));
      routePoints.push(new THREE.Vector3(x, .018, -stop.y + 4.25));
    }
    routePoints.push(new THREE.Vector3(x, .018, -stop.y + 3.5), new THREE.Vector3(x, .018, -stop.y - 3.5));
  });
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 1; i < routePoints.length; i++) path.add(new THREE.LineCurve3(routePoints[i - 1], routePoints[i]));
  const routeMaterial = new THREE.MeshStandardMaterial({ color: '#d6a148', metalness: .75, roughness: .4, emissive: '#9b5514', emissiveIntensity: .26 });
  materials.push(routeMaterial);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(path, 480, .025, 5, false), routeMaterial));
  const pulseMaterial = new THREE.MeshBasicMaterial({ color: '#ffca70' }); materials.push(pulseMaterial);
  const pulses = Array.from({ length: 12 }, () => {
    const p = new THREE.Mesh(new THREE.SphereGeometry(.043, 8, 6), pulseMaterial); scene.add(p); return p;
  });
  let width = 1, height = 1, shadowPosition = -1;
  function render(position: number, time: number, paused: boolean): void {
    const index = Math.min(stops.length - 2, Math.floor(position));
    const t = smooth(THREE.MathUtils.clamp(position - index, 0, 1));
    const a = stops[index], b = stops[index + 1];
    const side = width < 1000 ? 1 : mix(a.side, b.side, t);
    const x = mix(a.x, b.x, t) - side * (width < 600 ? 2 : 3.8);
    const y = mix(a.y, b.y, t);
    if (Math.abs(position - shadowPosition) > .0005) {
      renderer.shadowMap.needsUpdate = true;
      shadowPosition = position;
    }
    const yaw = mix(Math.sin(index * .9) * .11, Math.sin((index + 1) * .9) * .11, t);
    const elevation = 10.1 + Math.sin(t * Math.PI) * 1.6;
    camera.position.set(x + Math.sin(yaw) * 8.8, elevation, -y + Math.cos(yaw) * 8.8);
    camera.lookAt(x, 0, -y);
    camera.fov = width / height < .8 ? 48 : 46;
    camera.updateProjectionMatrix();
    key.position.set(x - 5, 13, -y + 6); key.target.position.set(x, 0, -y);
    fill.position.set(x + 8, 6, -y - 5); fill.target.position.set(x, 0, -y);
    groups.forEach((group, i) => { group.visible = Math.abs(stops[i].y - y) < 29; });
    pulses.forEach((pulse, i) => {
      pulse.visible = !paused;
      if (!paused) pulse.position.copy(path.getPoint((time * .000012 + i / pulses.length) % 1));
    });
    renderer.render(scene, camera);
  }
  return {
    render,
    resize(w, h) { width = w; height = h; camera.aspect = w / h; renderer.setSize(w, h, false); },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse(o => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
      geometryCache.forEach(g => geometries.add(g)); geometries.forEach(g => g.dispose());
      textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
      environment.dispose(); renderer.dispose();
    },
  };
}
