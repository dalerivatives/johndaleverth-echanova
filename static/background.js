/* ============================================================
   THE ANIMATED BACKGROUND  —  window.Background

   Two layers behind the page, both driven from Site settings rather than
   hardcoded arrays, so the look can be tuned from the editor:

     1. CODE FIELD — drifting snippets and formulas.
     2. ALGORITHM GRAPHS — generated node-and-edge diagrams (a tree, a mesh,
        a shortest-path network, a ring) with a traversal animating along the
        edges, the way a search actually walks a graph.

   Both are decoration, so both are `aria-hidden`, `pointer-events:none`, and
   both stop entirely under `prefers-reduced-motion`. The graphs are SVG
   rather than canvas: a few dozen nodes is nothing to lay out, SVG scales
   with the page without a redraw, and the strokes inherit the theme's colour
   tokens instead of needing a repaint on every theme switch.
   ============================================================ */
(() => {
  const codeField = document.getElementById("codeField");
  const graphField = document.getElementById("graphField");
  if(!codeField && !graphField) return;

  const safeLayers = [codeField, graphField].filter(Boolean);

  /* The previous build punched a circular/elliptical hole around the person.
     That did keep code and graph marks away from the portrait, but it also
     made the protection itself visible. The requested effect is simpler:
     leave the decorative layers whole and place them BEHIND the human, so the
     person reads like a foreground silhouette with the code world as a true
     backdrop. If an older stylesheet still adds the mask class, strip it. */
  safeLayers.forEach(layer=>layer.classList.remove("human-safe-mask"));

  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite=!!window.PortfolioPerformance?.lite;

  const FALLBACK_SNIPPETS = [
    "const future = build(idea);", "while(alive){ learn(); }", "SELECT * FROM ideas;",
    "npm run build", "O(n log n)", "E = mc²", "A = πr²", "∇ × E = -∂B/∂t",
  ];

  let config = {
    codeOn: true, density: 26, speed: 1, snippets: FALLBACK_SNIPPETS,
    graphOn: true, graphCount: 3, kinds: ["tree","mesh","path","ring"],
  };

  const num = (value, fallback) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const flag = (value, fallback) =>
    value === undefined || value === "" ? fallback : !/^(0|false|off|no)$/i.test(String(value));

  /* ---- 1. the code field --------------------------------------------- */
  function drawCode(){
    if(!codeField) return;
    codeField.innerHTML = "";
    if(!config.codeOn || reduced) return;

    const snippets = config.snippets.length ? config.snippets : FALLBACK_SNIPPETS;
    // Fewer on a phone: the same count on a narrow screen reads as clutter
    // rather than texture, and it's wasted work on the weakest device.
    const wide = window.innerWidth >= 700;
    const count = Math.max(0, Math.min(lite?8:32, Math.round(config.density * (wide ? 1 : 0.55))));

    const frag = document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const el = document.createElement("pre");
      // Every third one takes the formula colour, so the field reads as a
      // mix of code and maths rather than one flat wall of text.
      el.className = "code" + (i % 3 === 0 ? " formula" : "");
      const a = snippets[Math.floor(Math.random()*snippets.length)];
      const b = snippets[Math.floor(Math.random()*snippets.length)];
      el.textContent = a + "\n" + b;
      el.style.left = (Math.random()*100) + "%";
      el.style.top  = (5 + Math.random()*90) + "%";
      el.style.setProperty("--rot", (-32 + Math.random()*64) + "deg");
      el.style.setProperty("--dx", (-55 + Math.random()*110) + "px");
      el.style.setProperty("--dy", (-35 + Math.random()*70) + "px");
      const base = 11 + Math.random()*17;
      el.style.animationDuration = (base / Math.max(0.15, config.speed)) + "s";
      el.style.animationDelay = (-Math.random()*15) + "s";
      /* 0.55–1.0, not 0.16–0.50. The colour token already carries the
         alpha that makes this a backdrop; this only varies depth between
         snippets. The old range multiplied the token down to ~2% ink and
         made the whole field invisible — see PHASE 51 in style.css. */
      el.style.opacity = (0.55 + Math.random()*0.45).toFixed(2);
      frag.appendChild(el);
    }
    codeField.appendChild(frag);
  }

  /* ---- 2. the algorithm graphs ---------------------------------------- */

  /* These are 3D. Each generator returns nodes as {x,y,z} inside a cube
     roughly -50..50 on every axis, and the renderer rotates that cube and
     projects it to 2D every frame. A flat diagram slowly reveals itself as a
     picture; a rotating lattice reads as a structure you're looking into,
     which is what a graph actually is.

     The projection is a plain perspective divide rather than a WebGL context:
     a few dozen points is nothing to transform in JavaScript, it keeps the
     background free of a second three.js instance, and the result is still
     SVG, so it inherits the theme's colour tokens with no repaint. */
  const SHAPES = {
    /* A binary-ish tree — the shape you draw when explaining recursion.
       Children fan out in BOTH x and z, so rotating it shows the branching
       instead of a flat fan. */
    tree(rng){
      const nodes = [{x:0, y:-42, z:0}];
      const edges = [];
      let level = [0];
      const depth = 3 + Math.floor(rng()*2);
      for(let d=1; d<=depth; d++){
        const next = [];
        const y = -42 + (84 * d / depth);
        level.forEach(parent=>{
          const kids = rng() < 0.22 ? 1 : 2;   // the odd single child keeps it from looking printed
          for(let k=0;k<kids;k++){
            const spread = 40 / Math.pow(1.7, d - 1);
            const side = kids === 1 ? 0 : (k === 0 ? -1 : 1);
            nodes.push({
              x: clamp(nodes[parent].x + side*spread + (rng()*8 - 4)),
              y,
              z: clamp(nodes[parent].z + side*spread*0.7 + (rng()*14 - 7)),
            });
            edges.push([parent, nodes.length-1]);
            next.push(nodes.length-1);
          }
        });
        level = next;
        if(level.length > 7) break;            // stop before it turns to mush
      }
      return {nodes, edges};
    },

    /* Points scattered through the cube, each linked to its two nearest
       neighbours. Distance-based rather than random pairs, so it reads as a
       network instead of a cat's cradle. */
    mesh(rng){
      const nodes = [];
      const n = 9 + Math.floor(rng()*4);
      for(let i=0;i<n;i++) nodes.push({x:rng()*90-45, y:rng()*90-45, z:rng()*90-45});
      const edges = [];
      nodes.forEach((a, i)=>{
        nodes
          .map((b, j)=>({j, d: dist(a,b)}))
          .filter(o => o.j !== i)
          .sort((p,q)=>p.d-q.d)
          .slice(0, 2)
          .forEach(o=>{
            const key = i < o.j ? [i, o.j] : [o.j, i];
            if(!edges.some(e => e[0]===key[0] && e[1]===key[1])) edges.push(key);
          });
      });
      return {nodes, edges};
    },

    /* A path meandering through space — the answer a shortest-path search
       hands back, drawn as the route it actually is. */
    path(rng){
      const nodes = [];
      const n = 6 + Math.floor(rng()*3);
      for(let i=0;i<n;i++){
        nodes.push({
          x: -45 + (90 * i / (n-1)),
          y: rng()*70 - 35,
          z: rng()*70 - 35,
        });
      }
      return {nodes, edges: nodes.slice(1).map((_, i)=>[i, i+1])};
    },

    /* A ring, tilted out of plane, with chords across it. */
    ring(rng){
      const nodes = [];
      const n = 7 + Math.floor(rng()*3);
      const tilt = rng()*0.9 - 0.45;
      for(let i=0;i<n;i++){
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a)*40, y = Math.sin(a)*40;
        nodes.push({x, y: y*Math.cos(tilt), z: y*Math.sin(tilt)});
      }
      const edges = nodes.map((_, i)=>[i, (i+1) % n]);
      for(let k=0;k<2;k++){
        const a = Math.floor(rng()*n);
        const b = (a + 2 + Math.floor(rng()*(n-4))) % n;
        if(a !== b) edges.push([a, b]);
      }
      return {nodes, edges};
    },
  };

  const clamp = v => Math.max(-48, Math.min(48, v));
  const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);

  /* A seeded RNG so a given graph is stable while it's on screen — Math.random
     inside the generators would give a different shape on every resize. */
  function seeded(seed){
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* Breadth-first from node 0, returning edges in visit order. The traversal
     is what makes these read as algorithms rather than as ornaments: the
     highlight sweeps outward from a root exactly like a real search. */
  function walk(nodes, edges){
    const adjacency = nodes.map(()=>[]);
    edges.forEach(([a,b], i)=>{ adjacency[a].push([b,i]); adjacency[b].push([a,i]); });
    const seen = new Set([0]);
    const order = [];
    const queue = [0];
    while(queue.length){
      const at = queue.shift();
      adjacency[at].forEach(([to, edgeIndex])=>{
        if(seen.has(to)) return;
        seen.add(to);
        order.push(edgeIndex);
        queue.push(to);
      });
    }
    return order;
  }

  const FOCAL = 210;          // how strong the perspective is; larger = flatter

  /* One rAF loop for every graph on the page, not one each: a shared loop
     means the whole background costs a single callback per frame however many
     lattices are on screen, and they stay in step. */
  let frame = null;
  let scenes = [];

  function project(node, cosY, sinY, cosX, sinX){
    // spin around the vertical axis...
    const x = node.x*cosY - node.z*sinY;
    const zr = node.x*sinY + node.z*cosY;
    // ...and a fixed tilt so you're looking slightly down into the lattice
    const y = node.y*cosX - zr*sinX;
    const z = node.y*sinX + zr*cosX;
    const scale = FOCAL / (FOCAL + z);
    return {x: 50 + x*scale, y: 50 + y*scale, depth: scale};
  }

  let lastFrame=-Infinity;
  function tick(now){
    frame=null;
    if(document.hidden)return;
    if(now-lastFrame<(lite?66.67:50)){frame=requestAnimationFrame(tick);return;}
    lastFrame=now;
    scenes.forEach(scene=>{
      const angle = scene.phase + now * 0.00012 * scene.rate;
      const cosY = Math.cos(angle), sinY = Math.sin(angle);
      const cosX = scene.cosTilt, sinX = scene.sinTilt;

      const points = scene.nodes.map(n=>project(n, cosY, sinY, cosX, sinX));

      scene.edgeEls.forEach((el, i)=>{
        const [a, b] = scene.edges[i];
        el.setAttribute("x1", points[a].x.toFixed(2));
        el.setAttribute("y1", points[a].y.toFixed(2));
        el.setAttribute("x2", points[b].x.toFixed(2));
        el.setAttribute("y2", points[b].y.toFixed(2));
        // Depth cue: an edge at the back is thinner and fainter than one in
        // front. Without this the lattice looks like a flat tangle spinning.
        const d = (points[a].depth + points[b].depth) / 2;
        el.style.strokeWidth = (0.42 * d * d).toFixed(3);
        el.style.setProperty("--depth", (0.35 + (d - 0.7) * 1.5).toFixed(3));
      });

      scene.nodeEls.forEach((el, i)=>{
        const p = points[i];
        el.setAttribute("cx", p.x.toFixed(2));
        el.setAttribute("cy", p.y.toFixed(2));
        el.setAttribute("r", ((i === 0 ? 2.1 : 1.5) * p.depth * p.depth).toFixed(2));
        el.style.setProperty("--depth", (0.3 + (p.depth - 0.7) * 1.6).toFixed(3));
      });
    });
    if(!reduced)frame = requestAnimationFrame(tick);
  }

  function stopLoop(){
    if(frame !== null){ cancelAnimationFrame(frame); frame = null; }
    scenes = [];
    lastFrame=-Infinity;
  }

  function drawGraphs(){
    if(!graphField) return;
    stopLoop();
    graphField.innerHTML = "";
    if(!config.graphOn) return;

    const kinds = config.kinds.filter(k => SHAPES[k]);
    if(!kinds.length) return;

    const wide = window.innerWidth >= 700;
    const count = Math.max(0, Math.min(lite?1:3, Math.round(config.graphCount * (wide ? 1 : 0.6))));

    for(let g=0; g<count; g++){
      const rng = seeded(Date.now() + g * 7919);
      const kind = kinds[Math.floor(rng()*kinds.length)];
      const {nodes, edges} = SHAPES[kind](rng);
      const order = walk(nodes, edges);

      const wrap = document.createElement("div");
      wrap.className = "bg-graph";
      const size = 200 + Math.round(rng()*180);
      wrap.style.width = size + "px";
      wrap.style.height = size + "px";
      /* Bias the graphs into the side gutters. The workspace panel is opaque
         and centred, so a graph placed at random has a good chance of landing
         entirely behind it — with only a handful on screen, that means the
         layer looks like it isn't there. The snippets get away with random
         placement because there are twenty-odd of them. */
      if(wide){
        const gutter = rng() < 0.5 ? 1 + rng()*12 : 71 + rng()*17;
        wrap.style.left = gutter.toFixed(1) + "%";
      }else{
        wrap.style.left = (rng()*70).toFixed(1) + "%";
      }
      wrap.style.top = (5 + rng()*80) + "%";
      wrap.style.animationDuration = ((30 + rng()*24) / Math.max(0.15, config.speed)) + "s";
      wrap.style.animationDelay = (-rng()*20) + "s";

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      const edgeEls = edges.map(([a,b], i)=>{
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "bg-edge");
        // Normalises every edge to a length of 1 so a single dash rule can
        // draw a short link and a long one at the same visual speed.
        line.setAttribute("pathLength", "1");
        const step = order.indexOf(i);
        if(step >= 0 && !reduced){
          // Staggered by visit order — this is the whole trick: the edges
          // light up in the sequence a breadth-first search would take them.
          line.style.animationDelay = (step * 0.26).toFixed(2) + "s";
          line.classList.add("lit");
        }
        svg.appendChild(line);
        return line;
      });

      const nodeEls = nodes.map((n, i)=>{
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("class", "bg-node" + (i === 0 ? " root" : ""));
        if(!reduced) dot.style.animationDelay = (i * 0.18).toFixed(2) + "s";
        svg.appendChild(dot);
        return dot;
      });

      wrap.appendChild(svg);
      graphField.appendChild(wrap);

      const tilt = 0.22 + rng()*0.3;
      scenes.push({
        nodes, edges, edgeEls, nodeEls,
        phase: rng() * Math.PI * 2,
        rate: (0.6 + rng()*0.9) * (rng() < 0.5 ? -1 : 1) * Math.max(0.15, config.speed),
        cosTilt: Math.cos(tilt), sinTilt: Math.sin(tilt),
      });
    }

    if(!scenes.length) return;
    if(reduced){
      // One static projection instead of a spin, so the shape is still there
      // for someone who asked their system to stop animations.
      tick(0);
      cancelAnimationFrame(frame);
      frame = null;
    }else{
      frame = requestAnimationFrame(tick);
    }
  }

  function draw(){ drawCode(); drawGraphs(); }

  function load(settings){
    const s = settings || {};
    const lines = String(s.bg_code_snippets || "")
      .split("\n").map(t=>t.trim()).filter(Boolean);
    config = {
      codeOn:  flag(s.bg_code_on, true),
      density: Math.max(0, Math.min(80, num(s.bg_code_density, 26))),
      speed:   Math.max(0.15, Math.min(4, num(s.bg_code_speed, 1))),
      snippets: lines.length ? lines : FALLBACK_SNIPPETS,
      graphOn: flag(s.bg_graph_on, true),
      graphCount: Math.max(0, Math.min(6, num(s.bg_graph_count, 3))),
      kinds: String(s.bg_graph_kinds || "tree,mesh,path,ring")
        .split(",").map(t=>t.trim().toLowerCase()).filter(Boolean),
    };
    draw();
  }

  /* Redraw only when the WIDTH changes. On a phone the address bar sliding
     in and out fires a resize on every scroll direction change, and each
     one used to throw the whole background away and scatter a new one —
     the snippets and graphs visibly jumped while you scrolled. */
  let resizeTimer = null;
  let drawnWidth = window.innerWidth;
  window.addEventListener("resize", ()=>{
    if(window.innerWidth === drawnWidth) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{ drawnWidth = window.innerWidth; draw(); }, 260);
  });

  window.Background = { load, draw };
  document.addEventListener('visibilitychange',()=>{
    if(frame!==null){cancelAnimationFrame(frame);frame=null;}
    if(!document.hidden && scenes.length){lastFrame=-Infinity;tick(performance.now());}
  });
  draw();                                   // something is on screen immediately
  if(window.__settings) load(window.__settings);
})();
