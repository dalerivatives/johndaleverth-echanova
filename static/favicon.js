/* Fixed portrait branding for browser tabs and search crawlers.
   The portrait itself is shipped as real PNG/ICO files, so it is visible
   without JavaScript and cannot be replaced accidentally from editor state. */
(()=>{
  const ICON = "/brand-icon.png";

  function apply(){
    let link = document.getElementById("tabIcon");
    if(!link){
      link = document.createElement("link");
      link.id = "tabIcon";
      link.rel = "icon";
      link.type = "image/png";
      link.sizes = "192x192";
      document.head.appendChild(link);
    }
    link.href = ICON;
    return Promise.resolve(ICON);
  }

  function refresh(){ return apply(); }
  window.PortfolioFavicon = {apply, refresh};
})();
