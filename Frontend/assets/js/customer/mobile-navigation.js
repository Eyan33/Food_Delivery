(() => {
 "use strict";
 const mobileQuery = window.matchMedia("(max-width: 900px)");
 function initializeCustomerNavigation() {
  const button=document.getElementById("mobileMenuButton"), menu=document.getElementById("mobileNavigation");
  if(!button||!menu)return;
  const setOpen=(open,returnFocus=false)=>{
   const shouldOpen=Boolean(open&&mobileQuery.matches);
   menu.classList.toggle("is-open",shouldOpen);button.classList.toggle("is-open",shouldOpen);
   button.setAttribute("aria-expanded",String(shouldOpen));button.setAttribute("aria-label",shouldOpen?"Close menu":"Open menu");
   button.innerHTML=shouldOpen?'<span aria-hidden="true">×</span>':'<span aria-hidden="true">☰</span>';
   menu.setAttribute("aria-hidden",String(!shouldOpen));if(returnFocus)button.focus();
  };
  const currentPage=window.location.pathname.split("/").filter(Boolean).pop()||"home.html";
  const activePage=({"restaurant.html":"restaurants.html","order-details.html":"orders.html","checkout.html":"cart.html"})[currentPage]||currentPage;
  document.querySelectorAll("[data-customer-nav]").forEach(link=>{
   const targetPage=link.getAttribute("href")?.split("/").pop(),active=targetPage===activePage;
   link.classList.toggle("active",active);if(active)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");
  });
  button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();setOpen(button.getAttribute("aria-expanded")!=="true");});
  menu.addEventListener("click",event=>{if(event.target.closest("a"))setOpen(false);});
  document.addEventListener("click",event=>{if(!menu.contains(event.target)&&!button.contains(event.target))setOpen(false);});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&button.getAttribute("aria-expanded")==="true")setOpen(false,true);});
  mobileQuery.addEventListener?.("change",()=>setOpen(false));
  window.addEventListener("resize",()=>{if(!mobileQuery.matches)setOpen(false);});
  setOpen(false);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initializeCustomerNavigation,{once:true});else initializeCustomerNavigation();
})();
