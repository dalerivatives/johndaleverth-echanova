/* ============================================================
   CHAT AVATARS  —  window.ChatAvatar.svg(name)

   A little character head per chatter, drawn as inline SVG and picked
   deterministically from the name: the same name always gets the same face,
   on every device, with nothing to download and no third-party avatar
   service in the loop.

   The looks are ASSORTED rather than inferred. Names here are self-assigned
   and unverified — "Dale", "xX_ghost_Xx", "mom" — so guessing someone's
   gender from one would be wrong about as often as it was right, and wrong
   in a way that's unpleasant to be on the end of. The pool instead spans
   long hair, short hair, buns, braids, curls, caps and bald, so a room full
   of people looks like a room full of people. Anyone who wants a different
   face just changes their name.
   ============================================================ */
(() => {
  const SKIN   = ["#f6d5c0","#eec2a6","#e0ab86","#c68863","#a56a45","#7c4a2d","#5c3620","#f2dcc9"];
  const HAIR   = ["#2b2220","#4a3527","#7b4b28","#a9662f","#d9a441","#8c8c94","#e8e3dd","#3b3f6b","#7a3b6b","#2f6b5a"];
  const SHIRT  = ["#4f7fd8","#e0687f","#42a97a","#f0a03c","#8a63d2","#2fa8b8","#d95f4a","#5d6b7d"];
  const EYE    = ["#2b2220","#3b2a1c","#2f5d4a","#31527d"];

  /* Every style is drawn behind AND in front of the head, so long hair can
     fall past the jaw the way it actually does. */
  const HAIRSTYLES = [
    // 0 — short crop
    { back:"", front:'<path d="M14 26c0-9 6-15 14-15s14 6 14 15c0 0-4-6-14-6s-14 6-14 6z" fill="{h}"/>' },
    // 1 — long straight
    { back:'<path d="M11 30c0-12 6-20 17-20s17 8 17 20v18c0 3-3 4-5 3V30H16v21c-2 1-5 0-5-3z" fill="{h}"/>',
      front:'<path d="M14 27c0-10 6-16 14-16s14 6 14 16c0 0-3-7-14-7s-14 7-14 7z" fill="{h}"/>' },
    // 2 — bun
    { back:'<circle cx="28" cy="9" r="6" fill="{h}"/>',
      front:'<path d="M14 27c0-10 6-16 14-16s14 6 14 16c0 0-4-7-14-7s-14 7-14 7z" fill="{h}"/>' },
    // 3 — curly
    { back:'<g fill="{h}"><circle cx="16" cy="20" r="7"/><circle cx="28" cy="14" r="8"/><circle cx="40" cy="20" r="7"/><circle cx="21" cy="14" r="6"/><circle cx="35" cy="14" r="6"/></g>', front:"" },
    // 4 — braids
    { back:'<g fill="{h}"><rect x="8" y="24" width="7" height="24" rx="3.5"/><rect x="41" y="24" width="7" height="24" rx="3.5"/></g>',
      front:'<path d="M14 27c0-10 6-16 14-16s14 6 14 16c0 0-4-7-14-7s-14 7-14 7z" fill="{h}"/>' },
    // 5 — bald / very short
    { back:"", front:'<path d="M16 24c1-7 6-11 12-11s11 4 12 11c-3-4-7-6-12-6s-9 2-12 6z" fill="{h}" opacity=".55"/>' },
    // 6 — side part
    { back:"", front:'<path d="M14 27c0-10 6-16 14-16 6 0 10 3 12 8-4-2-9 1-14 2s-9 1-12 6z" fill="{h}"/>' },
    // 7 — cap
    { back:"", front:'<path d="M14 25c0-9 6-14 14-14s14 5 14 14H14z" fill="{h}"/><path d="M12 25h24v4H12z" fill="{h}" opacity=".75"/>' },
    // 8 — bob
    { back:'<path d="M12 30c0-12 7-19 16-19s16 7 16 19v6c0 2-2 3-4 2V31H16v7c-2 1-4 0-4-2z" fill="{h}"/>',
      front:'<path d="M14 27c0-10 6-16 14-16s14 6 14 16c0 0-4-7-14-7s-14 7-14 7z" fill="{h}"/>' },
    // 9 — mohawk / spiked
    { back:"", front:'<path d="M24 12l4-8 4 8 3-4 2 6c-3-2-6-3-9-3s-6 1-9 3l2-6z" fill="{h}"/><path d="M15 27c0-8 6-13 13-13s13 5 13 13c0 0-4-6-13-6s-13 6-13 6z" fill="{h}"/>' }
  ];

  /* A stable 32-bit hash. Not cryptographic — it only has to spread names
     across the option lists and give the same answer everywhere. */
  function hash(str){
    let h = 2166136261;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const cache = new Map();

  function svg(name){
    const key = String(name || "?");
    if(cache.has(key)) return cache.get(key);

    const h = hash(key);
    const pick = (arr, shift) => arr[(h >>> shift) % arr.length];

    const skin  = pick(SKIN, 0);
    const hair  = pick(HAIR, 5);
    const shirt = pick(SHIRT, 11);
    const eye   = pick(EYE, 17);
    const style = HAIRSTYLES[(h >>> 21) % HAIRSTYLES.length];
    const glasses = ((h >>> 26) % 5) === 0;
    const freckles = ((h >>> 28) % 4) === 0;
    const smile = ((h >>> 3) % 3);

    const paint = frag => (frag || "").replace(/\{h\}/g, hair);

    const mouth = smile === 0
      ? '<path d="M24 40c1.6 2 6.4 2 8 0" stroke="#8a4a44" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
      : smile === 1
      ? '<path d="M24 39.5c1.6 3 6.4 3 8 0 -1.4 4.2-6.6 4.2-8 0z" fill="#8a4a44"/>'
      : '<circle cx="28" cy="40.5" r="1.9" fill="#8a4a44"/>';

    const markup =
      `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${key.replace(/[<>&"]/g,"")}">
        <rect width="56" height="56" rx="28" fill="hsl(${h % 360} 45% 88%)"/>
        ${paint(style.back)}
        <path d="M22 40h12v8H22z" fill="${skin}"/>
        <path d="M9 56c1.5-8 8.5-12 19-12s17.5 4 19 12z" fill="${shirt}"/>
        <ellipse cx="28" cy="29" rx="13.5" ry="14.5" fill="${skin}"/>
        <ellipse cx="14.8" cy="31" rx="2.4" ry="3.2" fill="${skin}"/>
        <ellipse cx="41.2" cy="31" rx="2.4" ry="3.2" fill="${skin}"/>
        ${paint(style.front)}
        <circle cx="23" cy="30" r="1.9" fill="${eye}"/>
        <circle cx="33" cy="30" r="1.9" fill="${eye}"/>
        <circle cx="23.6" cy="29.4" r=".6" fill="#fff"/>
        <circle cx="33.6" cy="29.4" r=".6" fill="#fff"/>
        ${freckles ? '<g fill="#00000018"><circle cx="20" cy="35" r="1"/><circle cx="23" cy="36" r="1"/><circle cx="33" cy="36" r="1"/><circle cx="36" cy="35" r="1"/></g>' : ""}
        ${mouth}
        ${glasses ? `<g fill="none" stroke="#33383d" stroke-width="1.5"><circle cx="23" cy="30" r="4.6"/><circle cx="33" cy="30" r="4.6"/><path d="M27.6 30h.8M18.4 29.4l-3 .8M37.6 29.4l3 .8"/></g>` : ""}
      </svg>`;

    cache.set(key, markup);
    return markup;
  }

  window.ChatAvatar = { svg };
})();
