/* Réplica del dormitorio. Geometría y luz salen de Blender (blender/dormitorio-replica): aquí se pinta
   color = textura × luz horneada + un reflejo suave, y se pasa por AgX como el render. Unidades: cm. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = s => document.querySelector(s);
/* color: más marrón que naranja, medido zona a zona contra el render original */
const EXPO = -0.4, SAT = 1.2;
const COLOR = {};
const lin = h => new THREE.Color(h).toArray();
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer:coarse)').matches ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = Math.pow(2, EXPO);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fbbd8');
const FOVY = 54.47, SHIFT = 2*164.5/1449;               /* lente desplazada del render: las verticales no fugan */
const camera = new THREE.PerspectiveCamera(FOVY, 1, 3, 20000);
const MAXANI = Math.min(8, renderer.capabilities.getMaxAnisotropy());
let pinta = true;

const tl = new THREE.TextureLoader(), cache = {};
function tex(url, srgb = true){
  if(cache[url]) return cache[url];
  const t = tl.load(url, () => { pinta = true; });
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = MAXANI; t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return cache[url] = t;
}
function envTex(){
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#fbf3e8'); g.addColorStop(.48, '#e6d4bd'); g.addColorStop(.52, '#9b7b5a'); g.addColorStop(1, '#6d553d');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128); x.fillStyle = '#fff6e6'; x.fillRect(10, 20, 46, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
const ENV = envTex();
const VERT = `varying vec2 vU0, vU1; varying vec3 vN, vP;
  void main(){ vU0 = uv; vU1 = uv1; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `#define SATV ${SAT.toFixed(3)}
  uniform sampler2D map, lm, env; uniform vec3 color; uniform float rough, metal, spec, alpha, useMap, useLm, glow, unlit, mapK;
  varying vec2 vU0, vU1; varying vec3 vN, vP;
  void main(){
    vec3 a = color; if(useMap > .5) a *= texture2D(map, vU0).rgb * mapK;
    if(unlit > .5){ gl_FragColor = vec4(a * 1.6, 1.0); }
    else if(glow > 0.0){ gl_FragColor = vec4(a * min(glow, 12.0), 1.0); }
    else {
      vec3 L = useLm > .5 ? texture2D(lm, vU1).rgb * 5.0 : vec3(1.0);
      vec3 V = normalize(cameraPosition - vP), N = normalize(vN); if(dot(N, V) < 0.0) N = -N;
      vec3 R = reflect(-V, N); vec2 e = vec2(atan(R.z, R.x) / 6.28318 + .5, acos(clamp(R.y, -1., 1.)) / 3.14159);
      vec3 E = texture2D(env, vec2(e.x, 1. - e.y)).rgb;
      float lum = dot(L, vec3(.33)), occ = clamp(lum, 0., 1.), nv = clamp(dot(N, V), 0., 1.), gl = (1. - rough) * (1. - rough);
      vec3 F0 = mix(vec3(.08 * spec), a, metal), F = F0 + (max(vec3(gl), F0) - F0) * pow(1. - nv, 5.);
      gl_FragColor = vec4(a * (1. - metal) * L + E * F * occ * (metal > .5 ? max(.5, lum) : .6), alpha);
    }
    if(unlit < .5){ vec3 c = gl_FragColor.rgb; float y = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(y), c, SATV); gl_FragColor.rgb = max(c, 0.); }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
function material(m){
  const u = m.userData || {}, g = u.lmg, c = COLOR[m.name] ? lin(COLOR[m.name]) : (u.c || [1, 1, 1]), a = u.alpha == null ? 1 : u.alpha;
  const hasLm = ['floor', 'shell', 'furn', 'ext'].includes(g);
  const foto = /^foto_/.test(m.name);
  const map = foto ? tex(`fotos/${m.name.slice(5)}.webp`) : u.map ? tex(g === 'sky' ? 'tex/sky_jardin.webp' : `tex/${u.map}.webp`) : null;
  if(g === 'sky' && map){ map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; }
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, toneMapped: g !== 'sky',
    uniforms: { map: { value: map }, useMap: { value: map ? 1 : 0 }, lm: { value: hasLm ? tex(`lm_${g}.webp`) : null }, useLm: { value: hasLm ? 1 : 0 },
      env: { value: ENV }, color: { value: new THREE.Color(c[0], c[1], c[2]) }, rough: { value: u.rough ?? .6 }, metal: { value: u.metal || 0 },
      spec: { value: u.spec ?? .5 }, alpha: { value: a }, glow: { value: g === 'emit' ? (u.emit || 4) : 0 }, unlit: { value: g === 'sky' ? 1 : 0 }, mapK: { value: (foto || g === 'sky') ? 1 : 2 } },
    side: (u.ds || !hasLm) ? THREE.DoubleSide : THREE.FrontSide, transparent: a < 1, depthWrite: !(a < 1) });
}
fetch('room.json').then(r => r.json()).then(j => { const b = atob(j.glb), u = new Uint8Array(b.length); for(let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  $('#carga b').style.width = '80%'; new GLTFLoader().parse(u.buffer, '', gl => {
  const root = gl.scene; root.scale.setScalar(100);
  root.traverse(o => { if(o.isMesh) o.material = material(o.material); });
  scene.add(root); $('#carga').hidden = true; pinta = true;
}, fallo); }).catch(fallo);
function fallo(){ $('#carga div').firstChild.textContent = 'No se ha podido cargar el modelo. Recarga la página.'; }

/* ── cámara: mirar arrastrando, andar con rueda/WASD/pellizco; la vista del render es la cámara exacta ── */
const VISTAS = {
  render:  { p: [0, 103, 541], yaw: 0, pitch: 0, shift: 1 },
  pie:     { p: [0, 150, 300], yaw: 0, pitch: -.22, shift: 0 },
  armario: { p: [0, 150, 290], yaw: Math.PI, pitch: -.06, shift: 0 },
  ventana: { p: [95, 140, 420], yaw: .95, pitch: -.05, shift: 0 }
};
const pos = new THREE.Vector3(); let yaw = 0, pitch = 0, shift = 1, objetivo = null;
function ir(n, suave = true){
  const v = VISTAS[n]; document.querySelectorAll('.abajo button[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', b.id === 'b-' + n));
  objetivo = { p: new THREE.Vector3(...v.p), yaw: v.yaw, pitch: v.pitch, shift: v.shift };
  if(!suave){ pos.copy(objetivo.p); yaw = v.yaw; pitch = v.pitch; shift = v.shift; objetivo = null; }
  pinta = true;
}
ir('render', false);
const libre = () => { objetivo = null; document.querySelectorAll('.abajo button[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', 'false')); };
/* dentro del cuarto (y del pasillo de entrada) */
function limita(p){
  p.y = Math.max(40, Math.min(240, p.y));
  if(p.z > 575 && p.x > 52){ p.z = Math.min(p.z, 668); p.x = Math.min(p.x, 124); }
  else { p.x = Math.max(-124, Math.min(124, p.x)); p.z = Math.max(18, Math.min(575, p.z)); }
}
const tecla = {};
addEventListener('keydown', e => { tecla[e.code] = true; if(/Arrow/.test(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { tecla[e.code] = false; });
addEventListener('blur', () => { for(const k in tecla) tecla[k] = false; });
const punteros = new Map(); let pinza = 0;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
canvas.addEventListener('pointermove', e => {
  const p = punteros.get(e.pointerId); if(!p) return;
  if(punteros.size === 2){
    const [a, b] = [...punteros.values()], d0 = Math.hypot(a.x-b.x, a.y-b.y); p.x = e.clientX; p.y = e.clientY;
    const [c, d] = [...punteros.values()], d1 = Math.hypot(c.x-d.x, c.y-d.y); anda((d1-d0)*.8, 0); return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  libre(); yaw += dx*.0042; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy*.0036)); pinta = true;
});
const suelta = e => punteros.delete(e.pointerId);
canvas.addEventListener('pointerup', suelta); canvas.addEventListener('pointercancel', suelta);
canvas.addEventListener('wheel', e => { e.preventDefault(); anda(-e.deltaY*.25, 0); }, { passive: false });
function anda(f, l){
  libre();
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  pos.x += fx*f + Math.cos(yaw)*l; pos.z += fz*f - Math.sin(yaw)*l; limita(pos); pinta = true;
}
for(const [id, n] of [['b-render', 'render'], ['b-pie', 'pie'], ['b-armario', 'armario'], ['b-ventana', 'ventana']]) $('#' + id).onclick = () => ir(n);

/* comparar: original y réplica con la misma cámara */
const comp = $('#comp'), marco = $('#marco');
$('#b-comp').onclick = () => { comp.hidden = false; };
$('#b-cerrar').onclick = () => { comp.hidden = true; pinta = true; };
function corte(e){ const r = marco.getBoundingClientRect(), k = Math.max(0, Math.min(1, (e.clientX - r.left)/r.width));
  marco.querySelector('.b').style.clipPath = `inset(0 0 0 ${k*100}%)`; marco.querySelector('.raya').style.left = (k*100) + '%'; }
marco.addEventListener('pointerdown', e => { marco.setPointerCapture(e.pointerId); corte(e); });
marco.addEventListener('pointermove', e => { if(e.buttons || e.pointerType === 'touch') corte(e); });

function tam(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w/h; pinta = true; }
addEventListener('resize', tam); tam();
let t0 = performance.now();
function frame(t){
  const dt = Math.min(.05, (t - t0)/1000); t0 = t;
  const v = (tecla.KeyW || tecla.ArrowUp ? 1 : 0) - (tecla.KeyS || tecla.ArrowDown ? 1 : 0);
  const l = (tecla.KeyD ? 1 : 0) - (tecla.KeyA ? 1 : 0), g = (tecla.ArrowRight ? 1 : 0) - (tecla.ArrowLeft ? 1 : 0);
  if(v || l) anda(v*170*dt, l*140*dt);
  if(g){ libre(); yaw -= g*1.6*dt; pinta = true; }
  if(objetivo){
    const k = 1 - Math.pow(.0015, dt);
    pos.lerp(objetivo.p, k); yaw += (objetivo.yaw - yaw)*k; pitch += (objetivo.pitch - pitch)*k; shift += (objetivo.shift - shift)*k;
    if(pos.distanceTo(objetivo.p) < .05 && Math.abs(objetivo.yaw - yaw) < 1e-3) { pos.copy(objetivo.p); yaw = objetivo.yaw; pitch = objetivo.pitch; shift = objetivo.shift; objetivo = null; }
    pinta = true;
  } else if(shift > 0 && document.querySelector('#b-render').getAttribute('aria-pressed') !== 'true'){ shift = Math.max(0, shift - dt*3); pinta = true; }
  if(pinta){
    camera.position.copy(pos); camera.rotation.set(pitch, yaw, 0, 'YXZ');
    /* en pantallas más estrechas que el render se abre el ángulo para que quepa el mismo ancho */
    const k = Math.min(1, camera.aspect/(1086/1449));
    camera.fov = k < 1 ? 2*Math.atan(Math.tan(FOVY*Math.PI/360)/k)*180/Math.PI : FOVY; camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -SHIFT*shift; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.render(scene, camera); pinta = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
