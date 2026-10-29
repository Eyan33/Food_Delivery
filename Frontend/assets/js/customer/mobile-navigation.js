(() => {
"use strict";
const init=()=>{
 const button=document.getElementById("mobileMenuButton"),nav=document.getElementById("mobileNavigation");
 if(!button||!nav||button.dataset.drawerReady==="true") return;
 button.dataset.drawerReady="true";
 let backdrop=document.querySelector(".customer-menu-backdrop");
 if(!backdrop){backdrop=document.createElement("button");backdrop.type="button";backdrop.className="customer-menu-backdrop";backdrop.setAttribute("aria-label","Close navigation menu");backdrop.tabIndex=-1;document.body.appendChild(backdrop);}
 const mobile=()=>matchMedia("(max-width: 900px)").matches;
 const opened=()=>nav.classList.contains("open")||nav.classList.contains("active")||nav.classList.contains("show");
 const close=(focus=false)=>{nav.classList.remove("open","active","show");button.classList.remove("open");button.textContent="☰";button.setAttribute("aria-label","Open menu");button.setAttribute("aria-expanded","false");nav.setAttribute("aria-hidden",String(mobile()));backdrop.classList.remove("is-visible");document.body.classList.remove("customer-menu-open");if(focus)button.focus();};
 const open=()=>{if(!mobile())return;nav.classList.add("open");button.classList.add("open");button.textContent="×";button.setAttribute("aria-label","Close menu");button.setAttribute("aria-expanded","true");nav.setAttribute("aria-hidden","false");backdrop.classList.add("is-visible");document.body.classList.add("customer-menu-open");};
 document.addEventListener("click",e=>{if(e.target.closest("#mobileMenuButton")){e.preventDefault();e.stopImmediatePropagation();opened()?close():open();return;}if(e.target.closest(".customer-menu-backdrop")){close(true);return;}if(e.target.closest("#mobileNavigation a")&&mobile())close();},true);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&opened())close(true);});
 window.addEventListener("resize",()=>{if(!mobile())close();});
 close();
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();