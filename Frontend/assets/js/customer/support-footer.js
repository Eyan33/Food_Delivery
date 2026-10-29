(() => {
"use strict";
const init=async()=>{
 const footer=document.querySelector(".customer-footer .customer-footer-container");
 if(!footer||footer.querySelector(".customer-footer-support"))return;
 const section=document.createElement("section");section.className="customer-footer-support";section.setAttribute("aria-label","Customer support");
 section.innerHTML='<h3>Customer support</h3><p>Need help with an order or delivery?</p><p class="support-contact-row"><span aria-hidden="true">✉</span><span id="footerSupportEmail">Loading support email…</span></p><p class="support-contact-row"><span aria-hidden="true">☎</span><span id="footerSupportPhone">Loading support number…</span></p>';
 const nav=footer.querySelector(".footer-links");footer.insertBefore(section,nav||null);
 try{
  const configured=document.querySelector('meta[name="api-base-url"]')?.content?.trim()||window.FOOD_DELIVERY_API_BASE||(["localhost","127.0.0.1"].includes(location.hostname)?"http://localhost:5000/api":location.origin+"/api");
  const response=await fetch(configured.replace(/\/+$/,"")+"/public/support",{headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("Support contacts unavailable");
  const result=await response.json(),data=result.data||result,email=String(data.supportEmail||"").trim(),phone=String(data.supportPhone||"").trim();
  const emailNode=section.querySelector("#footerSupportEmail"),phoneNode=section.querySelector("#footerSupportPhone");
  if(email){const a=document.createElement("a");a.href="mailto:"+email;a.textContent=email;emailNode.replaceChildren(a);}else emailNode.textContent="Email not configured";
  if(phone){const a=document.createElement("a");a.href="tel:"+phone.replace(/[^+\d]/g,"");a.textContent=phone;phoneNode.replaceChildren(a);}else phoneNode.textContent="Phone number not configured";
 }catch(error){section.querySelector("#footerSupportEmail").textContent="Support email unavailable";section.querySelector("#footerSupportPhone").textContent="Support number unavailable";console.error("Could not load public support contacts:",error);}
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();