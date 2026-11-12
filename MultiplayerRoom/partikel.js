import * as THREE from "three";

const VERT = `
attribute float groesse;
attribute float alpha;
attribute vec3 farbe;
varying float vAlpha;
varying vec3 vFarbe;
uniform float skala;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = groesse * skala / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  vAlpha = alpha;
  vFarbe = farbe;
}`;

const FRAG = `
varying float vAlpha;
varying vec3 vFarbe;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = vAlpha * smoothstep(1.0, 0.25, r);
  gl_FragColor = vec4(vFarbe, a);
}`;

export class Partikel {
  constructor(scene, max, additiv) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.auftrieb = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("farbe", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("groesse", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { skala: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additiv ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additiv ? 6 : 5;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }

  setzeSkala(hoehePixel, fov) {
    this.material.uniforms.skala.value = hoehePixel / (2 * Math.tan((fov * Math.PI) / 360));
  }

  emit(p, v, farbe, s0, s1, life, a0 = 0.8, auftrieb = 0) {
    let i = this.n;
    if (i >= this.max) {
      i = Math.floor(Math.random() * this.max);
    } else {
      this.n++;
    }
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    const c = typeof farbe === "string" ? this.tmp.set(farbe) : farbe;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.auftrieb[i] = auftrieb;
  }

  update(dt) {
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        const j = --this.n;
        if (i !== j) {
          for (const arr of [this.pos, this.vel, this.col]) {
            arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2];
          }
          for (const arr of [this.life, this.maxLife, this.s0, this.s1, this.a0, this.auftrieb]) arr[i] = arr[j];
        }
        i--;
        continue;
      }
      const k = this.life[i] / this.maxLife[i];
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + this.auftrieb[i] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.05, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = this.a0[i] * (1 - k) * Math.min(1, this.life[i] * 12);
    }
    this.geo.setDrawRange(0, this.n);
    for (const name of ["position", "farbe", "groesse", "alpha"]) this.geo.attributes[name].needsUpdate = true;
  }
}
