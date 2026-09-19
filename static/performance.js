/* Keep the same features while reducing decorative work on smaller devices. */
(() => {
  const coarse=window.matchMedia('(pointer:coarse)').matches;
  const reduced=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const lite=reduced || !!navigator.connection?.saveData ||
    (navigator.deviceMemory>0 && navigator.deviceMemory<=4) ||
    (navigator.hardwareConcurrency>0 && navigator.hardwareConcurrency<=4) ||
    (coarse && Math.min(innerWidth,innerHeight)<900);
  window.PortfolioPerformance=Object.freeze({lite,reduced});
  document.documentElement.classList.toggle('effects-lite',lite);
  const visibility=()=>document.documentElement.classList.toggle('effects-paused',document.hidden);
  document.addEventListener('visibilitychange',visibility);
  visibility();
})();
