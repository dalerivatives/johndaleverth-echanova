/* ============================================================
   THE 3D ROBOT  —  TRAVELADE EXPLORER-BOT T-700V
   ------------------------------------------------------------
   Built to the multiview concept sheet: a 4.5ft white-and-Travelade-blue
   explorer unit on four all-terrain wheels.

     - A wide screen head carrying the Travelade mark, a sensor bar above
       it and an illuminated eye-array below
     - White torso with brand decal, side vents and a storage compartment
     - Articulated arms with blue cuffs and real jointed fingers
     - A battery pack and charging port on the back
     - Four chunky lugged wheels on a splayed chassis with an orange
       bumper strip

   Why built from three.js primitives rather than loading a model file: a
   .glb of this quality would be megabytes, and every part needs to be
   addressable anyway so the robot can react — the head turns to watch
   your cursor, the eye-array tracks with it, the wheels roll, panels fly
   apart on death. Primitives keep the whole thing a few KB of code and
   make every joint animatable.

   The two screens (head display, chest decal) are canvases drawn in this
   file, not image files. That keeps the robot self-contained — it cannot
   break because an asset 404s — and lets the head display carry live text.

   three.js is vendored at static/vendor/three.min.js rather than pulled
   from a CDN, so the robot works offline and can't break because a CDN is
   blocked or down.

   This file exposes window.Robot3D with:
     mount(container)   -> boolean (false if WebGL is unavailable)
     pick(nx, ny)       -> did a click at this point actually hit the robot
     hit(nx, ny)        -> play a hit reaction at a normalised 0-1 point
     explode()          -> blow it apart
     revive()           -> reassemble
     setHealth(pct)     -> 0-100, drives the damage look
     setScreen(title, status) -> the head display's text
     resize() / dispose()
   ============================================================ */
(function(){
  "use strict";

  /* Travelade's palette, straight off the concept sheet. */
  const PALETTE = {
    shell:   0xf5f7f9,   // white bodywork
    shellDk: 0xd3dade,   // recessed white / panel gaps
    blue:    0x1b9ad6,   // Travelade blue
    blueDk:  0x0c6fa8,
    navy:    0x16344c,
    orange:  0xef7f22,   // the one accent stripe on the bumper
    grey:    0x97a1a9,
    dark:    0x333c44,   // hands, vents, battery
    panel:   0x0a1219,   // screen glass
    glow:    0xcfeeff,   // the illuminated eye-array
    green:   0x53d97f    // status / charge LEDs
  };

  const Robot3D = {
    available: false,
    _mounted: false
  };

  let renderer, scene, camera, clock;
  let root, head, body, armL, armR, chassis, core;
  let eyeLamps = [], wheels = [], statusLed = null;
  let screenMesh = null, screenTex = null, screenCtx = null;
  let parts = [];                 // every piece, for the explosion
  let partHomes = [];             // their resting transforms
  let container = null;
  let rafId = null;
  let health = 100;

  // Animation state
  let recoil = { x:0, y:0, power:0 };
  let spin = 0;
  let dead = false;
  let deathT = 0;
  let reviveT = 0;

  const look = { x:0, y:0, tx:0, ty:0, idleAt:0, active:false };
  let blink = { next: 2.5, t: -1 };
  let wheelRoll = 0, wheelSpin = 0;
  let lastServo = 0;

  function rounded(w, h, d, r, seg){
    // three.js has no rounded box, and the softness is most of the look —
    // moulded white bodywork made of hard-edged boxes reads as cardboard.
    // BoxGeometry with a high segment count + vertex rounding gets there
    // without pulling in an extra geometry library.
    r = Math.min(r,w/2,h/2,d/2)*0.99;
    const s = Math.max(seg||6,10);
    const geo = new THREE.BoxGeometry(w,h,d,s,s,s);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const half = new THREE.Vector3(w/2 - r, h/2 - r, d/2 - r);
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos, i);
      const clamped = new THREE.Vector3(
        Math.max(-half.x, Math.min(half.x, v.x)),
        Math.max(-half.y, Math.min(half.y, v.y)),
        Math.max(-half.z, Math.min(half.z, v.z))
      );
      const dir = v.clone().sub(clamped);
      if(dir.lengthSq() > 0){
        dir.normalize().multiplyScalar(r);
        v.copy(clamped).add(dir);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  function shellMat(color, rough){
    return new THREE.MeshStandardMaterial({
      color, roughness: rough === undefined ? 0.3 : rough, metalness: 0.06
    });
  }
  function glowMat(color, intensity){
    return new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: intensity === undefined ? 1.0 : intensity,
      roughness: 0.3
    });
  }
  function track(mesh){ parts.push(mesh); return mesh; }

  /* ---- the Travelade mark --------------------------------------------
     Drawn rather than loaded. The robot is meant to work with no network
     and no assets beyond three.js, and a logo that 404s on a screen that
     is the face of the model is a worse failure than a slightly simpler
     mark. A rounded blue tile, a white T, and the orange swoosh. */
  function drawMark(c, x, y, size){
    const r = size*0.24;
    c.save();
    c.translate(x - size/2, y - size/2);
    c.fillStyle = "#1b9ad6";
    c.beginPath();
    if(c.roundRect) c.roundRect(0, 0, size, size, r);
    else c.rect(0, 0, size, size);
    c.fill();
    // the T
    c.fillStyle = "#ffffff";
    c.fillRect(size*0.2, size*0.22, size*0.6, size*0.15);
    c.fillRect(size*0.42, size*0.22, size*0.16, size*0.5);
    // the orange swoosh under it
    c.strokeStyle = "#ef7f22";
    c.lineWidth = size*0.13;
    c.lineCap = "round";
    c.beginPath();
    c.arc(size*0.5, size*0.55, size*0.26, Math.PI*0.08, Math.PI*0.62);
    c.stroke();
    c.restore();
  }

  function wordmark(c, x, y, px, light){
    c.font = `700 ${px}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`;
    c.textBaseline = "middle";
    const a = "TRAVEL", b = "ADE";
    const wa = c.measureText(a).width, wb = c.measureText(b).width;
    let left = x - (wa+wb)/2;
    c.textAlign = "left";
    c.fillStyle = light ? "#ffffff" : "#16344c";
    c.fillText(a, left, y);
    c.fillStyle = "#1b9ad6";
    c.fillText(b, left + wa, y);
  }

  /* ---- the head display ----------------------------------------------
     The concept sheet marks this "SCREEN", and on the sheet it shows the
     brand. A screen that only ever shows a logo is a sticker, though, so
     it carries the brand AND what the unit is doing: the status line the
     HUD shows, the time, and a charge bar that tracks the robot's health.
     Repainted twice a second, which is plenty for a clock and far short
     of a per-frame texture upload. */
  let screenLines = ["T-700V", "STANDBY"];
  let screenPainted = "";
  let screenAt = 0;
  const SW = 640, SH = 360;

  function buildScreenTexture(){
    const canvas = document.createElement("canvas");
    canvas.width = SW; canvas.height = SH;
    screenCtx = canvas.getContext("2d");
    screenTex = new THREE.CanvasTexture(canvas);
    if(THREE.SRGBColorSpace) screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.anisotropy = 4;
    paintScreen(true);
    return screenTex;
  }

  function paintScreen(force){
    if(!screenCtx) return;
    const time = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    const key = screenLines.join("|") + "|" + time + "|" + Math.round(health/4);
    if(!force && key === screenPainted) return;
    screenPainted = key;

    const c = screenCtx;
    const hurt = 1 - health/100;
    const ink = hurt > 0.65 ? "#ff6b6b" : "#4fc3ff";

    // glass
    const g = c.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, "#0d1a26"); g.addColorStop(1, "#060d14");
    c.fillStyle = g; c.fillRect(0, 0, SW, SH);
    // scan lines, so it reads as a display rather than a painted panel
    c.globalAlpha = 0.05; c.fillStyle = ink;
    for(let y=0; y<SH; y+=6) c.fillRect(0, y, SW, 2);
    c.globalAlpha = 1;

    drawMark(c, SW/2, 132, 108);
    wordmark(c, SW/2, 232, 46, true);

    // charge pips, top right — the green cell block on the sheet
    const cells = 4, lit = Math.ceil((health/100)*cells);
    for(let i=0;i<cells;i++){
      c.fillStyle = i < lit ? (hurt > 0.65 ? "#ff6b6b" : "#53d97f") : "rgba(255,255,255,.16)";
      c.fillRect(SW-40-i*26, 26, 18, 22);
    }
    c.strokeStyle = "rgba(255,255,255,.3)"; c.lineWidth = 3;
    c.strokeRect(SW-148, 20, 132, 34);

    // unit tag, top left
    c.font = "600 24px ui-monospace, Menlo, Consolas, monospace";
    c.textAlign = "left"; c.textBaseline = "middle";
    c.fillStyle = "rgba(255,255,255,.55)";
    c.fillText(screenLines[0].slice(0, 10), 26, 37);

    // status strip along the bottom
    c.fillStyle = "rgba(255,255,255,.07)";
    c.fillRect(0, SH-58, SW, 58);
    c.fillStyle = ink;
    c.font = "600 27px ui-monospace, Menlo, Consolas, monospace";
    c.fillText((screenLines[1] || "").slice(0, 22).toUpperCase(), 26, SH-28);
    c.textAlign = "right";
    c.fillStyle = "rgba(255,255,255,.8)";
    c.font = "700 30px ui-monospace, Menlo, Consolas, monospace";
    c.fillText(time, SW-26, SH-28);

    if(screenTex) screenTex.needsUpdate = true;
  }

  Robot3D.setScreen = function(title, status){
    if(title !== undefined && title !== null) screenLines[0] = String(title);
    if(status !== undefined && status !== null) screenLines[1] = String(status);
    paintScreen(true);
  };

  /* The chest decal — the brand block the sheet puts on the torso.
     Painted once onto a transparent canvas and hung a millimetre proud of
     the bodywork, which is how a real decal sits and avoids the z-fighting
     that printing straight onto the panel would cause. */
  function chestDecalTexture(){
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 256;
    const c = canvas.getContext("2d");
    drawMark(c, 256, 78, 96);
    wordmark(c, 256, 178, 54, false);
    const tex = new THREE.CanvasTexture(canvas);
    if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* The back plate — "T-700V / EXPLORER-BOT", as stencilled on the sheet. */
  function backPlateTexture(){
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 256;
    const c = canvas.getContext("2d");
    c.fillStyle = "#1c242b"; c.fillRect(0,0,512,256);
    c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 6;
    c.strokeRect(10, 10, 492, 236);
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#ffffff";
    c.font = "700 92px ui-monospace, Menlo, Consolas, monospace";
    c.fillText("T-700V", 256, 104);
    c.fillStyle = "#1b9ad6";
    c.font = "600 40px ui-monospace, Menlo, Consolas, monospace";
    c.fillText("EXPLORER-BOT", 256, 176);
    const tex = new THREE.CanvasTexture(canvas);
    if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* The roundel face: the mark on its own transparent disc. */
  function sideMarkTexture(){
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const c = canvas.getContext("2d");
    c.fillStyle = "#1b9ad6";
    c.beginPath(); c.arc(128, 128, 128, 0, Math.PI*2); c.fill();
    c.fillStyle = "#ffffff";
    c.fillRect(58, 74, 140, 34);
    c.fillRect(110, 74, 38, 118);
    c.strokeStyle = "#ef7f22"; c.lineWidth = 26; c.lineCap = "round";
    c.beginPath(); c.arc(128, 150, 62, Math.PI*0.1, Math.PI*0.6); c.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildRobot(){
    root = new THREE.Group();

    /* ================= HEAD ========================================= */
    /* A wide screen unit rather than a skull: on the sheet the head IS
       the display, in a white bezel, with the sensor bar above and the
       eye-array below. */
    head = new THREE.Group();

    const bezel = new THREE.Mesh(rounded(2.02, 1.34, 0.74, 0.3, 12), shellMat(PALETTE.shell, 0.22));
    bezel.castShadow = true;
    head.add(track(bezel));

    // The dark glass the display sits in, slightly proud of the bezel.
    const glass = new THREE.Mesh(rounded(1.68, 1.0, 0.1, 0.16, 8), new THREE.MeshStandardMaterial({
      color: PALETTE.panel, roughness: 0.07, metalness: 0.3
    }));
    glass.position.set(0, 0.02, 0.36);
    head.add(track(glass));

    screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.56, 0.88),
      new THREE.MeshBasicMaterial({ map: buildScreenTexture(), toneMapped: false })
    );
    screenMesh.position.set(0, 0.02, 0.42);
    head.add(track(screenMesh));

    /* Sensor bar across the top: a camera lens, a dark strip, a green
       status LED. The sheet calls this out with its own leader line, so
       it gets real geometry rather than being painted on. */
    const sensorBar = new THREE.Mesh(rounded(1.1, 0.16, 0.16, 0.06, 6), shellMat(PALETTE.dark, 0.4));
    sensorBar.position.set(0, 0.53, 0.35);
    head.add(track(sensorBar));

    const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.1, 22), shellMat(PALETTE.grey, 0.3));
    lensRing.rotation.x = Math.PI/2;
    lensRing.position.set(-0.14, 0.53, 0.4);
    head.add(track(lensRing));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.12, 20), new THREE.MeshStandardMaterial({
      color: 0x06121c, roughness: 0.04, metalness: 0.6
    }));
    lens.rotation.x = Math.PI/2;
    lens.position.set(-0.14, 0.53, 0.43);
    head.add(track(lens));

    const lens2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 16), new THREE.MeshStandardMaterial({
      color: 0x0a1a26, roughness: 0.06, metalness: 0.5
    }));
    lens2.rotation.x = Math.PI/2;
    lens2.position.set(0.12, 0.53, 0.43);
    head.add(track(lens2));

    statusLed = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), glowMat(PALETTE.green, 1.2));
    statusLed.position.set(0.42, 0.53, 0.42);
    head.add(track(statusLed));

    /* ---- the illuminated eye-array ----------------------------------
       Four lamps in a dark recess under the screen. This is what the
       robot "looks" with: the whole array does the blinking, and the
       lamps brighten toward whichever side it is looking at, so a glance
       reads even though there are no eyeballs to move. */
    const eyeBar = new THREE.Mesh(rounded(1.24, 0.24, 0.14, 0.09, 7), new THREE.MeshStandardMaterial({
      color: 0x11181e, roughness: 0.2, metalness: 0.35
    }));
    eyeBar.position.set(0, -0.53, 0.34);
    head.add(track(eyeBar));

    eyeLamps = [];
    [-0.36, -0.12, 0.12, 0.36].forEach(x=>{
      const lamp = new THREE.Mesh(rounded(0.16, 0.1, 0.06, 0.04, 6), glowMat(PALETTE.glow, 1.1));
      lamp.position.set(x, -0.53, 0.4);
      lamp.userData.baseScale = lamp.scale.clone();
      lamp.userData.x = x;
      head.add(track(lamp));
      eyeLamps.push(lamp);
    });

    /* Blue roundel on each side of the head — the brand mark from the
       sheet's side and back views. Printed on a disc rather than built
       from little white bars: the bars had to stand proud of the disc to
       be visible, which from the front read as two nubs growing out of
       the robot's ears. */
    const markTex = sideMarkTexture();
    [-1, 1].forEach(side=>{
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 32), shellMat(PALETTE.blueDk, 0.3));
      disc.rotation.z = Math.PI/2;
      disc.position.set(side*1.0, 0.0, -0.16);
      head.add(track(disc));
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.205, 32),
        new THREE.MeshBasicMaterial({ map: markTex, transparent: true, toneMapped: false })
      );
      face.position.set(side*1.035, 0.0, -0.16);
      face.rotation.y = side * Math.PI/2;
      head.add(track(face));
    });

    // Vent slots on the top of the head, as in the top view.
    for(let i=-1;i<=1;i++){
      const slot = new THREE.Mesh(rounded(0.52, 0.05, 0.1, 0.02, 5), shellMat(PALETTE.grey, 0.45));
      slot.position.set(0, 0.68, -0.1 + i*0.16);
      head.add(track(slot));
    }

    head.position.y = 1.9;
    root.add(head);

    /* ================= TORSO ======================================== */
    body = new THREE.Group();

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.42, 20), shellMat(PALETTE.grey, 0.4));
    neck.position.y = 1.34;
    body.add(track(neck));

    const torso = new THREE.Mesh(rounded(1.52, 1.62, 1.0, 0.24, 10), shellMat(PALETTE.shell, 0.28));
    torso.position.y = 0.5;
    torso.castShadow = true;
    body.add(track(torso));

    // Blue shoulder yoke across the upper chest.
    const yoke = new THREE.Mesh(rounded(1.9, 0.32, 1.0, 0.15, 8), shellMat(PALETTE.blue, 0.32));
    yoke.position.y = 1.08;
    body.add(track(yoke));

    // Blue flank stripes down both sides.
    [-1, 1].forEach(side=>{
      const stripe = new THREE.Mesh(rounded(0.1, 1.3, 0.9, 0.05, 7), shellMat(PALETTE.blue, 0.32));
      stripe.position.set(side*0.74, 0.46, 0);
      body.add(track(stripe));
    });

    // Chest decal.
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.46),
      new THREE.MeshBasicMaterial({ map: chestDecalTexture(), transparent: true, toneMapped: false })
    );
    decal.position.set(0, 0.66, 0.507);
    body.add(track(decal));

    /* Louvres. The sheet shows these on the BACK panel, not the chest —
       on the chest they cut straight through the brand decal, which is
       both wrong and ugly. */
    [-1, 1].forEach(side=>{
      for(let i=0;i<5;i++){
        const slat = new THREE.Mesh(rounded(0.28, 0.06, 0.08, 0.025, 5), shellMat(PALETTE.grey, 0.5));
        slat.position.set(side*0.48, 1.0 - i*0.12, -0.5);
        body.add(track(slat));
      }
    });

    /* Storage compartment — the lower door on the sheet, with a recessed
       handle and a status light beside it. */
    const doorFrame = new THREE.Mesh(rounded(1.06, 0.68, 0.08, 0.1, 7), shellMat(PALETTE.shellDk, 0.42));
    doorFrame.position.set(0, -0.02, 0.5);
    body.add(track(doorFrame));
    const door = new THREE.Mesh(rounded(0.94, 0.56, 0.08, 0.08, 7), shellMat(PALETTE.shell, 0.26));
    door.position.set(0, -0.02, 0.54);
    body.add(track(door));
    const handle = new THREE.Mesh(rounded(0.42, 0.06, 0.06, 0.025, 5), shellMat(PALETTE.grey, 0.4));
    handle.position.set(0, 0.16, 0.59);
    body.add(track(handle));

    // The power core, the part that goes red when the unit is hurt.
    core = new THREE.Mesh(rounded(0.26, 0.08, 0.06, 0.03, 5), glowMat(PALETTE.blue, 1.0));
    core.position.set(0, -0.36, 0.58);
    body.add(track(core));

    /* Back: battery pack, charge LEDs, charging port, ident plate. */
    const battery = new THREE.Mesh(rounded(0.9, 0.86, 0.26, 0.08, 7), shellMat(PALETTE.dark, 0.6));
    battery.position.set(0, 0.42, -0.58);
    battery.castShadow = true;
    body.add(track(battery));
    for(let i=0;i<3;i++){
      const pip = new THREE.Mesh(rounded(0.4, 0.07, 0.05, 0.02, 5), glowMat(PALETTE.green, 0.9));
      pip.position.set(0, 0.62 - i*0.13, -0.72);
      body.add(track(pip));
    }
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.36),
      new THREE.MeshBasicMaterial({ map: backPlateTexture(), toneMapped: false })
    );
    plate.position.set(0, -0.18, -0.508);
    plate.rotation.y = Math.PI;
    body.add(track(plate));
    const port = new THREE.Mesh(rounded(0.2, 0.16, 0.08, 0.04, 5), shellMat(PALETTE.blue, 0.35));
    port.position.set(0.44, -0.2, -0.52);
    body.add(track(port));

    root.add(body);

    /* ================= ARMS + HANDS ================================= */
    /* The sheet's arms are articulated and end in real hands, not claws:
       four fingers and a thumb in dark grey, with a Travelade-blue cuff
       at the wrist. The fingers are the detail that most changes the
       character — a hand says "carries your bag", a claw says "machine". */
    function makeArm(side){
      const arm = new THREE.Group();
      const jointMat = shellMat(PALETTE.grey, 0.34);

      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 26, 20), shellMat(PALETTE.blue, 0.3));
      arm.add(track(ball));

      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.24, 8, 22), shellMat(PALETTE.shell, 0.28));
      upper.position.y = -0.27;
      upper.castShadow = true;
      arm.add(track(upper));

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 22, 18), jointMat);
      elbow.position.y = -0.52;
      arm.add(track(elbow));

      const forearm = new THREE.Group();
      forearm.position.y = -0.52;
      forearm.rotation.x = -0.26;

      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 8, 22), shellMat(PALETTE.shell, 0.26));
      lower.position.y = -0.23;
      lower.castShadow = true;
      forearm.add(track(lower));

      // The blue cuff band.
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.184, 0.17, 24), shellMat(PALETTE.blue, 0.3));
      cuff.position.y = -0.41;
      forearm.add(track(cuff));

      const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), jointMat);
      wrist.position.y = -0.52;
      forearm.add(track(wrist));

      // Palm.
      const palm = new THREE.Mesh(rounded(0.27, 0.26, 0.15, 0.055, 7), shellMat(PALETTE.dark, 0.45));
      palm.position.set(0, -0.65, 0.02);
      forearm.add(track(palm));

      // Four fingers, each with a knuckle and two segments so the hand
      // has visible joints at this size rather than reading as a mitten.
      [-0.075, -0.025, 0.025, 0.075].forEach((fx, i)=>{
        const len = i === 0 || i === 3 ? 0.1 : 0.12;
        const seg1 = new THREE.Mesh(rounded(0.042, len, 0.05, 0.018, 5), shellMat(PALETTE.dark, 0.45));
        seg1.position.set(fx, -0.79, 0.03);
        forearm.add(track(seg1));
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), shellMat(PALETTE.grey, 0.4));
        knuckle.position.set(fx, -0.85, 0.03);
        forearm.add(track(knuckle));
        const seg2 = new THREE.Mesh(rounded(0.038, len*0.8, 0.045, 0.016, 5), shellMat(PALETTE.dark, 0.45));
        seg2.position.set(fx, -0.91, 0.045);
        seg2.rotation.x = 0.3;
        forearm.add(track(seg2));
      });

      // Thumb, set across the palm on the inside.
      const thumb = new THREE.Mesh(rounded(0.05, 0.11, 0.055, 0.022, 5), shellMat(PALETTE.dark, 0.45));
      thumb.position.set(-side*0.14, -0.76, 0.06);
      thumb.rotation.z = side*0.7;
      forearm.add(track(thumb));
      const thumbTip = new THREE.Mesh(rounded(0.045, 0.08, 0.05, 0.02, 5), shellMat(PALETTE.dark, 0.45));
      thumbTip.position.set(-side*0.19, -0.83, 0.08);
      thumbTip.rotation.z = side*0.35;
      forearm.add(track(thumbTip));

      arm.add(forearm);
      arm.position.set(side*1.0, 1.0, 0.2);
      return arm;
    }
    armL = makeArm(-1); armR = makeArm(1);
    root.add(armL); root.add(armR);

    /* ================= CHASSIS + WHEELS ============================= */
    /* Four lugged all-terrain wheels on a splayed chassis, exactly as the
       front view shows them: the axles angle outward, which widens the
       footprint and is why the sheet's robot looks planted rather than
       perched. */
    chassis = new THREE.Group();

    const deck = new THREE.Mesh(rounded(1.42, 0.44, 1.62, 0.18, 9), shellMat(PALETTE.shell, 0.3));
    deck.castShadow = true;
    chassis.add(track(deck));

    const skirt = new THREE.Mesh(rounded(1.46, 0.22, 1.66, 0.1, 8), shellMat(PALETTE.blue, 0.32));
    skirt.position.y = -0.2;
    chassis.add(track(skirt));

    // The one orange accent on the whole machine — the front bumper strip.
    const bumper = new THREE.Mesh(rounded(0.86, 0.13, 0.1, 0.05, 6), shellMat(PALETTE.orange, 0.36));
    bumper.position.set(0, -0.2, 0.85);
    chassis.add(track(bumper));

    wheels = [];
    function makeWheel(sx, sz){
      const hubGroup = new THREE.Group();

      // Tyre: a broad cylinder, kept to 20 radial segments on purpose —
      // faceted reads as a heavy moulded tyre where a smooth one reads as
      // a rubber band.
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.32, 30),
        new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.95, metalness: 0.02 }));
      tyre.rotation.z = Math.PI/2;
      tyre.castShadow = true;
      hubGroup.add(track(tyre));

      // Lugs around the tread.
      const lugMat = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.97 });
      for(let i=0;i<16;i++){
        const a = (i/16)*Math.PI*2;
        const lug = new THREE.Mesh(rounded(0.35, 0.05, 0.14, 0.022, 5), lugMat);
        lug.position.set(0, Math.sin(a)*0.448, Math.cos(a)*0.448);
        lug.rotation.x = -a;
        hubGroup.add(track(lug));
      }

      // Silver hub with spokes, on the outward face.
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.36, 26), shellMat(PALETTE.shell, 0.26));
      hub.rotation.z = Math.PI/2;
      hubGroup.add(track(hub));
      for(let i=0;i<5;i++){
        const a = (i/5)*Math.PI*2;
        const spoke = new THREE.Mesh(rounded(0.38, 0.36, 0.08, 0.028, 5), shellMat(PALETTE.grey, 0.34));
        spoke.position.set(0, Math.sin(a)*0.17, Math.cos(a)*0.17);
        spoke.rotation.x = -a;
        hubGroup.add(track(spoke));
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 20), shellMat(PALETTE.blue, 0.3));
      cap.rotation.z = Math.PI/2;
      hubGroup.add(track(cap));

      wheels.push(hubGroup);

      // The strut the wheel hangs off, angled outward.
      const mount = new THREE.Group();
      const strut = new THREE.Mesh(rounded(0.5, 0.2, 0.26, 0.08, 6), shellMat(PALETTE.shell, 0.3));
      strut.position.set(sx*0.16, 0.06, 0);
      mount.add(track(strut));
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), shellMat(PALETTE.grey, 0.35));
      joint.position.set(sx*0.34, 0.0, 0);
      mount.add(track(joint));

      hubGroup.position.set(sx*0.4, -0.08, 0);
      mount.add(hubGroup);
      mount.position.set(sx*0.58, -0.18, sz*0.66);
      mount.rotation.y = sx * 0.62;        // toe-out
      mount.rotation.z = -sx * 0.1;        // a touch of camber
      return mount;
    }
    [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([sx, sz]) => chassis.add(makeWheel(sx, sz)));

    chassis.position.y = -0.46;
    root.add(chassis);

    root.position.y = -0.34;
    scene.add(root);

    // Remember where everything rests, so the explosion can throw parts
    // away from here and the revive can put them back exactly.
    partHomes = parts.map(m => ({
      pos: m.position.clone(),
      rot: m.rotation.clone(),
      scale: m.scale.clone()
    }));
  }

  function buildStudio(){
    const studio=new THREE.Scene();studio.background=new THREE.Color(0x45505c);
    for(const [x,y,z,w,h,intensity] of [[-3,4,4,3,5,3],[4,2,1,2,4,2],[0,5,-3,4,2,3]]){
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));
      panel.position.set(x,y,z);panel.lookAt(0,0,0);studio.add(panel);
    }
    const pmrem=new THREE.PMREMGenerator(renderer),reflection=pmrem.fromScene(studio,.04);
    scene.environment=reflection.texture;scene.userData.reflection=reflection;pmrem.dispose();
    studio.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  }

  function buildLights(){
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5560, 1.1));

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3.4, 5.2, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;   key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias=0.025;
    scene.add(key);

    // A cool rim from behind separates the white shell from a dark page.
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.5);
    rim.position.set(-4, 2.4, -3.4);
    scene.add(rim);

    // A soft neutral fill keeps the white bodywork from going grey in
    // the lower half without tinting it.
    const fill = new THREE.DirectionalLight(0xdce9f2, 0.6);
    fill.position.set(-2.4, -1.2, 3);
    scene.add(fill);
  }

  function buildGround(){
    // Shadow-only ground: catches the drop shadow so the robot is planted,
    // without painting a visible floor over the page background.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({ opacity: 0.26 })
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -1.42;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  /* ---- watching the cursor -------------------------------------------
     The robot looks at the pointer anywhere on the PAGE, not just inside
     its own box. That is the whole difference between a model that spins
     on a turntable and one that notices you: the angle is measured from
     the robot's own position on screen to where your cursor actually is,
     so walking the mouse across the page walks its gaze with you.

     Angles are clamped, because a head that swivels past its shoulders
     stops looking alive and starts looking broken. */
  /* getBoundingClientRect() forces the browser to flush layout, and this
     runs on EVERY mouse move across the whole page — including while the
     chat panel is closed and the robot is not even on screen. Reading it
     at most four times a second is indistinguishable to the eye (the box
     only moves when the page is scrolled or resized) and takes the cost
     from per-move to negligible. */
  let rectCache = null, rectAt = 0;
  function stageRect(){
    const now = performance.now();
    if(!rectCache || now - rectAt > 250){
      rectCache = container.getBoundingClientRect();
      rectAt = now;
    }
    return rectCache;
  }

  function onPointerMove(e){
    if(!container) return;
    const r = stageRect();
    if(!r.width || !r.height) return;
    const cx = r.left + r.width*0.5;
    const cy = r.top + r.height*0.42;      // the head, not the middle
    const dx = (e.clientX - cx) / Math.max(r.width, 260);
    const dy = (e.clientY - cy) / Math.max(r.height, 220);
    look.tx = Math.max(-0.62, Math.min(0.62, dx*0.95));
    look.ty = Math.max(-0.30, Math.min(0.38, dy*0.55));
    look.active = true;
    look.idleAt = performance.now();
  }
  function onPointerGone(){ look.active = false; }
  function invalidateRect(){ rectCache = null; }

  Robot3D.mount = function(el){
    if(Robot3D._mounted) return true;
    if(typeof THREE === "undefined") return false;
    container = el;

    try{
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    }catch(err){
      return false;   // no WebGL — the caller falls back to the flat robot
    }
    if(!renderer || !renderer.getContext()) return false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth || 320, el.clientHeight || 240);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1;
    if(THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, (el.clientWidth||320)/(el.clientHeight||240), 0.1, 100);

    frameCamera(el.clientWidth||320, el.clientHeight||240);

    clock = new THREE.Clock();
    buildStudio();
    buildLights();
    buildGround();
    buildRobot();

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove, {passive:true});
    window.addEventListener("pointerleave", onPointerGone, {passive:true});
    window.addEventListener("blur", onPointerGone);
    window.addEventListener("scroll", invalidateRect, {passive:true});

    Robot3D._mounted = true;
    Robot3D.available = true;
    inView=true;
    renderObserver=new IntersectionObserver(entries=>{
      inView=entries[0].isIntersecting;
      resumeRendering();
    });
    renderObserver.observe(container);
    document.addEventListener('visibilitychange',resumeRendering);
    resumeRendering();

    /* The boot chirp, once, when the robot first appears — but only if the
       audio clock is already awake, so the robot never becomes the reason
       a browser logs an autoplay warning. */
    try{ if(window.SFX && window.SFX.running && window.SFX.bootup) window.SFX.bootup(); }catch(_){}
    return true;
  };

  /* ---- framing ---------------------------------------------------------
     The stage is a short, wide box (270px tall on the site), and the robot
     is a tall figure — so the camera distance cannot be a constant or the
     antennae get cropped on one screen and the robot floats tiny on
     another. FIT_H is the robot's real height in world units plus a little
     air; the distance is solved from the field of view so that height
     always exactly fills the frame, and on a narrow stage the horizontal
     fit takes over so the treads never get clipped either. */
  const FIT_H = 4.75, FIT_W = 4.5, FIT_Y = 0.24;

  function frameCamera(w, h){
    const aspect = w/h;
    const vFov = camera.fov * Math.PI/180;
    const distH = (FIT_H/2) / Math.tan(vFov/2);
    const hFov = 2 * Math.atan(Math.tan(vFov/2) * aspect);
    const distW = (FIT_W/2) / Math.tan(hFov/2);
    const dist = Math.max(distH, distW);
    camera.position.set(0, FIT_Y + 0.18, dist);
    camera.lookAt(0, FIT_Y, 0);
  }

  function onResize(){
    if(!renderer || !container) return;
    const w = container.clientWidth || 320, h = container.clientHeight || 240;
    /* Re-apply the pixel ratio, not just the size. It's set once at mount,
       but devicePixelRatio changes when the page is zoomed or the window is
       dragged to a different-density monitor — and a canvas still rendering
       at the old ratio is exactly the "blurry screen" you then see. */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    frameCamera(w, h);
    invalidateRect();
  }
  Robot3D.resize = onResize;

  /* ---- did that click actually land ON the robot? --------------------

     The stage is a rectangle and the robot is a small figure standing in the
     middle of it, so most of that rectangle is empty air. Treating the whole
     box as the target meant a click well clear of the robot still took health
     off it, which looks broken the moment anyone notices.

     A raycast answers it exactly: turn the click into a ray through the
     camera and ask the scene what it crosses. No hand-maintained hitbox to
     drift out of step with the model, and it stays correct while the robot
     is recoiling, leaning or mid-animation, because it tests the geometry
     where it actually is this frame. */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  Robot3D.pick = function(nx, ny){
    if(!root || !camera) return false;
    // Normalised device coordinates: -1..1, y flipped.
    pointer.x = nx * 2 - 1;
    pointer.y = -(ny * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    // `true` walks the whole group — the robot is a tree of small meshes, and
    // only the leaves carry geometry.
    return raycaster.intersectObject(root, true).length > 0;
  };

  /* A tap at normalised (nx, ny) — 0,0 top-left of the stage. The robot is
     pushed away from the point of impact, so a hit on its left shoulder
     knocks it right and a hit on its head snaps it back. */
  Robot3D.hit = function(nx, ny){
    if(dead) return;
    const dx = (nx - 0.5);
    const dy = (ny - 0.5);
    recoil.x = -dx * 1.5;
    recoil.y = -dy * 1.0;
    recoil.power = 1;
    spin += (dx > 0 ? -1 : 1) * 0.22;
    wheelSpin += (dx > 0 ? -1 : 1) * 5.5;   // the wheels scrabble on impact
    blink.t = 0;                            // and it flinches
    try{
      if(window.SFX){
        if(window.SFX.servo) window.SFX.servo();
        if(window.SFX.tread) window.SFX.tread();   // the wheels scrabble for grip
      }
    }catch(_){}
  };

  Robot3D.explode = function(){
    if(dead) return;
    dead = true; deathT = 0;
    parts.forEach((mesh, i)=>{
      // Give each part a push outward from the middle plus some tumble.
      const home = partHomes[i];
      const dir = home.pos.clone().normalize();
      if(dir.lengthSq() === 0) dir.set(Math.random()-0.5, 1, Math.random()-0.5).normalize();
      mesh.userData.vel = dir.multiplyScalar(2.4 + Math.random()*2.6)
        .add(new THREE.Vector3((Math.random()-0.5)*2, 2.6 + Math.random()*2, (Math.random()-0.5)*2));
      mesh.userData.spin = new THREE.Vector3(
        (Math.random()-0.5)*14, (Math.random()-0.5)*14, (Math.random()-0.5)*14
      );
    });
  };

  Robot3D.revive = function(){
    dead = false; reviveT = 0;
    parts.forEach((mesh, i)=>{
      const home = partHomes[i];
      mesh.position.copy(home.pos);
      mesh.rotation.copy(home.rot);
      mesh.scale.copy(home.scale).multiplyScalar(0.01);
      mesh.visible = true;
    });
    recoil.power = 0; spin = 0;
    try{ if(window.SFX && window.SFX.bootup) window.SFX.bootup(); }catch(_){}
  };

  Robot3D.setHealth = function(pct){
    health = Math.max(0, Math.min(100, pct));
    paintScreen(true);
  };

  let renderedAt=0,renderObserver=null,inView=false;
  function resumeRendering(){
    if(rafId){cancelAnimationFrame(rafId);rafId=null;}
    if(renderer && inView && !document.hidden){
      clock.getDelta();
      rafId=requestAnimationFrame(loop);
    }
  }

  function loop(now=0){
    rafId=null;
    if(!renderer || !inView || document.hidden)return;
    rafId = requestAnimationFrame(loop);
    if(!container?.getClientRects().length){clock.getDelta();return;}
    const bounds=container.getBoundingClientRect();
    if(bounds.bottom<0 || bounds.top>innerHeight || now-renderedAt<1000/60){return;}
    renderedAt=now;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if(dead){
      deathT += dt;
      parts.forEach(mesh=>{
        const vel = mesh.userData.vel;
        if(!vel) return;
        vel.y -= 9.4 * dt;                       // gravity on the debris
        mesh.position.addScaledVector(vel, dt);
        mesh.rotation.x += mesh.userData.spin.x * dt;
        mesh.rotation.y += mesh.userData.spin.y * dt;
        mesh.rotation.z += mesh.userData.spin.z * dt;
        const fade = Math.max(0, 1 - deathT/1.5);
        mesh.scale.setScalar(Math.max(0.001, fade));
        if(fade <= 0.002) mesh.visible = false;
      });
    }else{
      // Reassembly pop after a revive
      if(reviveT < 1){
        reviveT = Math.min(1, reviveT + dt*1.9);
        const e = 1 - Math.pow(1 - reviveT, 3);          // ease-out cubic
        const overshoot = 1 + Math.sin(reviveT*Math.PI) * 0.14;
        parts.forEach((mesh,i)=>{
          mesh.scale.copy(partHomes[i].scale).multiplyScalar(e * overshoot);
        });
      }

      const hurt = 1 - health/100;

      /* ---- gaze ------------------------------------------------------
         After a few seconds without the pointer moving, the robot stops
         staring at where you left it and starts glancing around on its
         own. A model frozen mid-stare reads as hung; a model that looks
         away and back reads as waiting. */
      if(look.active && now - look.idleAt > 3800) look.active = false;
      if(!look.active){
        look.tx = Math.sin(t*0.31) * 0.34 + Math.sin(t*0.13) * 0.14;
        look.ty = Math.sin(t*0.24 + 1.1) * 0.10;
      }
      const prevX = look.x;
      // Frame-rate independent easing; the head lags the cursor slightly,
      // which is what gives the turn weight.
      const ease = 1 - Math.pow(0.0045, dt);
      look.x += (look.tx - look.x) * ease;
      look.y += (look.ty - look.y) * ease;

      // A big, deliberate turn gets a servo noise. Gated hard, or a mouse
      // waved across the page would sound like a drill.
      const turn = Math.abs(look.x - prevX) / Math.max(dt, 0.001);
      if(turn > 0.9 && now - lastServo > 900){
        lastServo = now;
        try{ if(window.SFX && window.SFX.servo) window.SFX.servo(); }catch(_){}
      }

      // Idle: a slow settle on the suspension, twitchier as HP drops.
      const speed = 1 + hurt*1.9;
      root.position.y = -0.34 + Math.sin(t*1.5*speed) * 0.035;
      // The body follows the gaze later and much less than the head —
      // shoulders turning with the neck is what stops it looking like a
      // screen bolted to a post.
      root.rotation.y = look.x*0.3 + Math.sin(t*0.5)*0.04 + spin;
      head.rotation.y = look.x*0.8;
      head.rotation.x = look.y*0.55;
      head.position.y = 1.9 + Math.sin(t*1.5*speed + 0.4) * 0.02;

      body.rotation.y = look.x * 0.11;
      body.rotation.z = -look.x * 0.04;

      /* ---- the eye-array blinking and tracking -------------------------
         There are no eyeballs to move, so a glance has to be carried by
         the lamps: the whole array dips together for a blink, and the
         lamps on the side the robot is looking toward burn brighter than
         the ones behind the turn. That brightness gradient is what makes
         a screen-faced robot read as looking AT something.

         The blink timing is irregular on purpose. A blink on a fixed
         timer is uncanny in a way people notice without being able to
         say why. */
      blink.next -= dt;
      if(blink.next <= 0 && blink.t < 0){
        blink.t = 0;
        blink.next = 2.2 + Math.random()*4.5;
      }
      let lidOpen = 1;
      if(blink.t >= 0){
        blink.t += dt;
        const p = blink.t / 0.13;                 // a blink lasts 130ms
        lidOpen = p < 1 ? Math.abs(Math.cos(p*Math.PI)) : 1;
        lidOpen = Math.max(0.08, lidOpen);
        if(blink.t > 0.13) blink.t = -1;
      }

      // Arms hang and sway, and flail when badly damaged.
      armL.rotation.x = Math.sin(t*1.2) * 0.12 - hurt*0.5;
      armR.rotation.x = Math.sin(t*1.2 + Math.PI) * 0.12 - hurt*0.5;
      armL.rotation.z = -0.08 + Math.sin(t*0.8)*0.03 - hurt*0.35;
      armR.rotation.z = 0.08 - Math.sin(t*0.8)*0.03 + hurt*0.35;

      // Wheels: a slow creep as the unit shifts its weight, plus whatever
      // scrabble a hit just added.
      wheelSpin *= Math.pow(0.05, dt);
      wheelRoll += (Math.sin(t*0.7)*0.5 + wheelSpin) * dt;
      wheels.forEach(w => { w.rotation.x = wheelRoll; });

      // Recoil from a hit, springing back to rest.
      if(recoil.power > 0.001){
        recoil.power *= Math.pow(0.004, dt);          // frame-rate independent
        const p = recoil.power;
        root.position.x = recoil.x * p * 0.5;
        root.rotation.z = recoil.x * p * 0.42;
        root.rotation.x = -recoil.y * p * 0.42;
        head.rotation.x += -recoil.y * p * 0.7;
        const squash = 1 + p*0.09;
        root.scale.set(squash, 1/squash, squash);
      }else{
        root.position.x *= 0.9;
        root.rotation.z *= 0.9;
        root.rotation.x *= 0.9;
        root.scale.lerp(new THREE.Vector3(1,1,1), 0.2);
      }
      spin *= Math.pow(0.2, dt);

      /* The array is calm white-blue when healthy and turns red and
         flickery as HP falls, so the unit's state is readable at a glance
         without reading the number off the screen. */
      const danger = hurt;
      const lampColor = new THREE.Color(PALETTE.glow).lerp(new THREE.Color(0xff3a3a), danger);
      const flicker = danger > 0.7 ? (0.55 + Math.random()*0.75) : 1;
      eyeLamps.forEach(lamp=>{
        const base = lamp.userData.baseScale;
        if(base) lamp.scale.set(base.x, base.y * lidOpen, base.z);
        // Brighter on the side it is looking toward.
        const bias = 1 + Math.max(-0.55, Math.min(0.55, look.x)) * Math.sign(lamp.userData.x) * 1.1;
        lamp.material.color.copy(lampColor);
        lamp.material.emissive.copy(lampColor);
        lamp.material.emissiveIntensity = 1.05 * bias * lidOpen * flicker;
      });

      core.material.color.copy(new THREE.Color(PALETTE.blue).lerp(new THREE.Color(0xff3a3a), danger));
      core.material.emissive.copy(core.material.color);
      core.material.emissiveIntensity = (0.8 + Math.sin(t*3.4)*0.3) * flicker;

      // The status LED on the sensor bar: green while healthy, blinking
      // amber-red once the unit is in trouble.
      if(statusLed){
        const bad = danger > 0.5;
        const c = bad ? new THREE.Color(0xff5a3a) : new THREE.Color(PALETTE.green);
        statusLed.material.color.copy(c);
        statusLed.material.emissive.copy(c);
        statusLed.material.emissiveIntensity = bad ? (Math.sin(t*9) > 0 ? 1.6 : 0.15) : 1.1;
      }

      // The head display ticks twice a second — often enough for a clock,
      // rare enough that it is not a per-frame texture upload.
      if(now - screenAt > 500){ screenAt = now; paintScreen(false); }
    }

    renderer.render(scene, camera);
  }

  Robot3D.dispose = function(){
    if(rafId) cancelAnimationFrame(rafId);
    rafId=null;
    if(renderObserver)renderObserver.disconnect();
    document.removeEventListener('visibilitychange',resumeRendering);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerleave", onPointerGone);
    window.removeEventListener("blur", onPointerGone);
    window.removeEventListener("scroll", invalidateRect);
    if(screenTex) screenTex.dispose();
    if(scene?.userData.reflection)scene.userData.reflection.dispose();
    if(renderer){
      renderer.dispose();
      if(renderer.domElement && renderer.domElement.parentNode){
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    Robot3D._mounted = false;
  };

  window.Robot3D = Robot3D;
})();
