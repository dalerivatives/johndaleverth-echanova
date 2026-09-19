/* ============================================================
   THE 3D ROBOT
   A real WebGL robot built from three.js primitives — a chunky toy-like
   unit with a glossy white shell, a dark visor with glowing eyes, pink
   accents and a smooth domed head.

   Why built from primitives rather than loading a model file: a .glb of
   this quality would be megabytes, and every part needs to be addressable
   anyway so the robot can react — the head recoils, the arms swing, the
   body spins, panels fly apart on death. Primitives keep the whole thing
   a few KB of code and make every joint animatable.

   three.js is vendored at static/vendor/three.min.js rather than pulled
   from a CDN, so the robot works offline and can't break because a CDN is
   blocked or down.

   This file exposes window.Robot3D with:
     mount(container)   -> boolean (false if WebGL is unavailable)
     hit(nx, ny)        -> play a hit reaction at a normalised 0-1 point
     explode()          -> blow it apart
     revive()           -> reassemble
     setHealth(pct)     -> 0-100, drives the damage look
     dispose()
   ============================================================ */
(function(){
  "use strict";

  const PALETTE = {
    shell:   0xf2f4f6,
    shellDk: 0xd8dde2,
    accent:  0xf1a9b4,   // the pink trim
    visor:   0x10161c,
    eye:     0x5fe8d0,
    metal:   0x8b959d
  };

  const Robot3D = {
    available: false,
    _mounted: false
  };

  let renderer, scene, camera, clock;
  let root, head, body, armL, armR, legL, legR, eyeL, eyeR, core;
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

  function rounded(w, h, d, r, seg){
    // three.js has no rounded box, and the softness is most of the look —
    // a chunky toy robot made of hard-edged boxes reads as a cardboard box.
    // BoxGeometry with a high segment count + vertex rounding gets there
    // without pulling in an extra geometry library.
    const geo = new THREE.BoxGeometry(w, h, d, seg||6, seg||6, seg||6);
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
    geo.computeVertexNormals();
    return geo;
  }

  function shellMat(color, rough){
    return new THREE.MeshStandardMaterial({
      color, roughness: rough === undefined ? 0.32 : rough, metalness: 0.05
    });
  }

  function track(mesh){
    parts.push(mesh);
    return mesh;
  }

  function buildRobot(){
    root = new THREE.Group();

    // ---- head -------------------------------------------------------
    head = new THREE.Group();
    const skull = new THREE.Mesh(rounded(1.86, 1.62, 1.5, 0.66, 12), shellMat(PALETTE.shell, 0.22));
    skull.scale.set(1, 0.96, 0.94);
    skull.castShadow = true;
    head.add(track(skull));

    // visor — a slightly flattened dark shield sitting proud of the face
    const visor = new THREE.Mesh(rounded(1.3, 0.88, 0.24, 0.36, 10), new THREE.MeshStandardMaterial({
      color: PALETTE.visor, roughness: 0.1, metalness: 0.25
    }));
    visor.position.set(0, -0.03, 0.68);
    head.add(track(visor));

    const eyeGeo = new THREE.SphereGeometry(0.2, 24, 24);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.eye, emissive: PALETTE.eye, emissiveIntensity: 1.6, roughness: 0.28
    });
    eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.31, -0.01, 0.76);
    eyeL.scale.set(1, 1.06, 0.6);
    eyeR = eyeL.clone();
    eyeR.position.x = 0.31;
    head.add(track(eyeL)); head.add(track(eyeR));

    // The little white catchlight that makes the eyes read as friendly
    // rather than as two glowing dots.
    const glintMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.2
    });
    [-1, 1].forEach(side=>{
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 14), glintMat);
      glint.position.set(side*0.31 - 0.05, 0.08, 0.86);
      glint.scale.set(1, 1, 0.5);
      head.add(track(glint));
    });

    // ear pods
    const podGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.17, 24);
    const podMat = shellMat(PALETTE.shell, 0.3);
    [-1, 1].forEach(side=>{
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.rotation.z = Math.PI/2;
      pod.position.set(side*0.96, -0.04, 0);
      head.add(track(pod));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.055, 12, 26),
        new THREE.MeshStandardMaterial({color: PALETTE.accent, roughness:0.35}));
      ring.rotation.y = Math.PI/2;
      ring.position.set(side*1.06, -0.04, 0);
      head.add(track(ring));
    });

    // cheeks
    [-1, 1].forEach(side=>{
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16),
        new THREE.MeshStandardMaterial({color: PALETTE.accent, roughness:0.4}));
      cheek.position.set(side*0.62, -0.4, 0.58);
      cheek.scale.set(1, 0.7, 0.55);
      head.add(track(cheek));
    });

    // No antennae. They doubled the head's silhouette height for two thin
    // stalks, which read as bulk rather than detail at this size — a smooth
    // dome is the cleaner shape. A small gloss highlight sits there instead.
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 20, 16, 0, Math.PI*2, 0, Math.PI*0.5),
      shellMat(PALETTE.shell, 0.16)
    );
    crown.position.set(-0.16, 0.74, 0.1);
    crown.scale.set(1, 0.42, 0.8);
    head.add(track(crown));

    head.position.y = 1.5;
    root.add(head);

    // ---- neck + body -------------------------------------------------
    body = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 16), shellMat(PALETTE.metal, 0.45));
    neck.position.y = 0.92;
    body.add(track(neck));

    const torso = new THREE.Mesh(rounded(1.14, 1.12, 0.86, 0.36, 9), shellMat(PALETTE.shell, 0.26));
    torso.position.y = 0.36;
    torso.castShadow = true;
    body.add(track(torso));

    core = new THREE.Mesh(rounded(0.3, 0.13, 0.06, 0.05, 4), new THREE.MeshStandardMaterial({
      color: PALETTE.eye, emissive: PALETTE.eye, emissiveIntensity: 1.4, roughness: 0.3
    }));
    core.position.set(0, 0.3, 0.41);
    body.add(track(core));

    // shoulders
    [-1, 1].forEach(side=>{
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 18),
        new THREE.MeshStandardMaterial({color: PALETTE.accent, roughness:0.35}));
      shoulder.position.set(side*0.6, 0.68, 0);
      shoulder.scale.set(1, 0.85, 1);
      body.add(track(shoulder));
    });
    root.add(body);

    // ---- arms ----------------------------------------------------------
    function makeArm(side){
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(rounded(0.3, 0.5, 0.3, 0.14, 6), shellMat(PALETTE.shell, 0.3));
      upper.position.y = -0.25;
      arm.add(track(upper));
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 14), shellMat(PALETTE.metal, 0.45));
      joint.position.y = -0.52;
      arm.add(track(joint));
      const lower = new THREE.Mesh(rounded(0.27, 0.44, 0.27, 0.13, 6), shellMat(PALETTE.shell, 0.3));
      lower.position.y = -0.76;
      arm.add(track(lower));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16),
        new THREE.MeshStandardMaterial({color: PALETTE.accent, roughness:0.4}));
      hand.position.y = -1.02;
      arm.add(track(hand));
      arm.position.set(side*0.72, 0.66, 0);
      return arm;
    }
    armL = makeArm(-1); armR = makeArm(1);
    root.add(armL); root.add(armR);

    // ---- legs / feet ---------------------------------------------------
    function makeLeg(side){
      const leg = new THREE.Group();
      const shin = new THREE.Mesh(rounded(0.34, 0.32, 0.34, 0.15, 6), shellMat(PALETTE.shell, 0.3));
      shin.position.y = -0.12;
      leg.add(track(shin));
      const foot = new THREE.Mesh(rounded(0.44, 0.22, 0.56, 0.1, 6), shellMat(PALETTE.shell, 0.28));
      foot.position.set(0, -0.32, 0.08);
      foot.castShadow = true;
      leg.add(track(foot));
      const toe = new THREE.Mesh(rounded(0.3, 0.08, 0.2, 0.04, 5),
        new THREE.MeshStandardMaterial({color: PALETTE.accent, roughness:0.4}));
      toe.position.set(0, -0.28, 0.26);
      leg.add(track(toe));
      leg.position.set(side*0.32, -0.16, 0);
      return leg;
    }
    legL = makeLeg(-1); legR = makeLeg(1);
    root.add(legL); root.add(legR);

    root.position.y = -0.35;
    scene.add(root);

    // Remember where everything rests, so the explosion can throw parts
    // away from here and the revive can put them back exactly.
    partHomes = parts.map(m => ({
      pos: m.position.clone(),
      rot: m.rotation.clone(),
      scale: m.scale.clone()
    }));
  }

  function buildLights(){
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5560, 1.15));

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3.4, 5.2, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;   key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0012;
    scene.add(key);

    // A cool rim from behind separates the white shell from a dark page.
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.5);
    rim.position.set(-4, 2.4, -3.4);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffd9e2, 0.5);
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
    ground.position.y = -1.02;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  Robot3D.mount = function(el){
    if(Robot3D._mounted) return true;
    if(window.PortfolioPerformance?.lite)return false; // existing playable 2D robot
    if(typeof THREE === "undefined") return false;
    container = el;

    try{
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    }catch(err){
      return false;   // no WebGL — the caller falls back to the flat robot
    }
    if(!renderer || !renderer.getContext()) return false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(el.clientWidth || 320, el.clientHeight || 240);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if(THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, (el.clientWidth||320)/(el.clientHeight||240), 0.1, 100);
    camera.position.set(0, 0.62, 7.9);
    camera.lookAt(0, 0.42, 0);

    clock = new THREE.Clock();
    buildLights();
    buildGround();
    buildRobot();

    window.addEventListener("resize", onResize);
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
    return true;
  };

  function onResize(){
    if(!renderer || !container) return;
    const w = container.clientWidth || 320, h = container.clientHeight || 240;
    /* Re-apply the pixel ratio, not just the size. It's set once at mount,
       but devicePixelRatio changes when the page is zoomed or the window is
       dragged to a different-density monitor — and a canvas still rendering
       at the old ratio is exactly the "blurry screen" you then see. */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
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
  };

  Robot3D.setHealth = function(pct){
    health = Math.max(0, Math.min(100, pct));
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
    if(bounds.bottom<0 || bounds.top>innerHeight || now-renderedAt<1000/30){return;}
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

      // Idle: a slow breath-like bob, faster and twitchier as HP drops.
      const speed = 1 + hurt*1.9;
      root.position.y = -0.35 + Math.sin(t*1.5*speed) * 0.07;
      root.rotation.y = Math.sin(t*0.5) * 0.16 + spin;
      head.rotation.y = Math.sin(t*0.42) * 0.1;
      head.position.y = 1.5 + Math.sin(t*1.5*speed + 0.4) * 0.03;

      // Arms swing gently, and flail when badly damaged.
      armL.rotation.x = Math.sin(t*1.2) * 0.16 - hurt*0.5;
      armR.rotation.x = Math.sin(t*1.2 + Math.PI) * 0.16 - hurt*0.5;
      armL.rotation.z = 0.1 + Math.sin(t*0.8)*0.05 + hurt*0.35;
      armR.rotation.z = -0.1 - Math.sin(t*0.8)*0.05 - hurt*0.35;

      // Recoil from a hit, springing back to rest.
      if(recoil.power > 0.001){
        recoil.power *= Math.pow(0.004, dt);          // frame-rate independent
        const p = recoil.power;
        root.position.x = recoil.x * p * 0.5;
        root.rotation.z = recoil.x * p * 0.42;
        root.rotation.x = -recoil.y * p * 0.42;
        head.rotation.x = -recoil.y * p * 0.7;
        const squash = 1 + p*0.09;
        root.scale.set(squash, 1/squash, squash);
      }else{
        root.position.x *= 0.9;
        root.rotation.z *= 0.9;
        root.rotation.x *= 0.9;
        head.rotation.x *= 0.9;
        root.scale.lerp(new THREE.Vector3(1,1,1), 0.2);
      }
      spin *= Math.pow(0.2, dt);

      // Eyes and core: calm cyan when healthy, angry red and flickering as
      // HP falls, so the state is readable at a glance without the number.
      const danger = hurt;
      const eyeColor = new THREE.Color(PALETTE.eye).lerp(new THREE.Color(0xff5b5b), danger);
      const flicker = danger > 0.7 ? (0.55 + Math.random()*0.75) : 1;
      [eyeL, eyeR].forEach(eye=>{
        eye.material.color.copy(eyeColor);
        eye.material.emissive.copy(eyeColor);
        eye.material.emissiveIntensity = 1.5 * flicker;
      });
      core.material.color.copy(eyeColor);
      core.material.emissive.copy(eyeColor);
      core.material.emissiveIntensity = (1.2 + Math.sin(t*3.4)*0.5) * flicker;
    }

    renderer.render(scene, camera);
  }

  Robot3D.dispose = function(){
    if(rafId) cancelAnimationFrame(rafId);
    rafId=null;
    if(renderObserver)renderObserver.disconnect();
    document.removeEventListener('visibilitychange',resumeRendering);
    window.removeEventListener("resize", onResize);
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
