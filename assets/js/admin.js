
(function(){
  const D=window.TROTRO_DATA;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let data=JSON.parse(localStorage.getItem("trotroData")||"null")||D;
  function save(){localStorage.setItem("trotroData",JSON.stringify(data));toast("Changes saved")}
  function toast(t){const x=$("#toast");x.textContent=t;x.style.display="block";setTimeout(()=>x.style.display="none",1800)}
  function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
  function shell(){
    const nav=$("#adminNav"); if(!nav)return;
    nav.innerHTML=`<div class="admin-brand">TrotroMall Admin</div><a href="index.html">Dashboard</a><a href="homepage.html">Homepage & CMS</a><a href="listings.html">Listings</a><a href="categories.html">Categories</a><a href="users.html">Users & businesses</a><a href="messages.html">Messages</a><a href="reports.html">Reports & moderation</a><a href="ads.html">Advertising</a><a href="payments.html">Payments & featured</a><a href="pages.html">Pages & content</a><a href="settings.html">Site settings</a><a href="../index.html">View website</a><button type="button" class="admin-logout" id="adminLogout">Sign out</button>`;
    const path=location.pathname.split("/").pop();$$("a",nav).forEach(a=>{if(a.getAttribute("href")===path)a.classList.add("active")});
    const logout=$("#adminLogout");
    if(logout) logout.onclick=async()=>{try{await window.TROTRO_SUPABASE.client.auth.signOut();}finally{location.href="login.html";}};
  }
  function dashboard(){
    $("#stats").innerHTML=[["Users","1,284"],["Active listings",data.listings.length],["Pending moderation","18"],["Reports","7"]].map(x=>`<div class="stat"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join("");
    $("#adminRecent").innerHTML=data.listings.slice(0,7).map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.category)}</td><td>${esc(x.location)}</td><td><button class="action">Edit</button></td></tr>`).join("");
  }
  function homepage(){
    $("#slidesEditor").innerHTML=data.slides.map((s,i)=>`<div class="admin-card" data-slide="${i}" style="margin-bottom:10px"><div class="field"><label>Slide title</label><input value="${esc(s.title)}" data-key="title"></div><div class="field" style="margin-top:10px"><label>Text</label><input value="${esc(s.text)}" data-key="text"></div><div class="field" style="margin-top:10px"><label>Image URL</label><input value="${esc(s.image)}" data-key="image"></div><div style="margin-top:10px"><button class="action danger" data-delete-slide="${i}">Delete slide</button></div></div>`).join("");
    $("#adsEditor").innerHTML=data.ads.map((a,i)=>`<div class="admin-card" data-ad="${i}" style="margin-bottom:10px"><div class="field"><label>Ad title</label><input value="${esc(a.title)}" data-key="title"></div><div class="field" style="margin-top:10px"><label>Ad text</label><input value="${esc(a.text)}" data-key="text"></div><div class="field" style="margin-top:10px"><label>Image URL</label><input value="${esc(a.image)}" data-key="image"></div><div style="margin-top:10px"><button class="action danger" data-delete-ad="${i}">Delete ad</button></div></div>`).join("");
    $("#saveHomepage").onclick=()=>{ $$("#slidesEditor [data-slide]").forEach(el=>{const i=+el.dataset.slide;$$("[data-key]",el).forEach(inp=>data.slides[i][inp.dataset.key]=inp.value)});$$("#adsEditor [data-ad]").forEach(el=>{const i=+el.dataset.ad;$$("[data-key]",el).forEach(inp=>data.ads[i][inp.dataset.key]=inp.value)});save()};
    $("#addSlide").onclick=()=>{data.slides.push({title:"New promotion",text:"Edit this slide from the admin panel.",image:"https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",button:"Learn more"});save();homepage()};
    $("#addAd").onclick=()=>{data.ads.push({title:"New advertisement",text:"Edit this advertisement.",image:"https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",url:"#"});save();homepage()};
    $$("[data-delete-slide]").forEach(b=>b.onclick=()=>{data.slides.splice(+b.dataset.deleteSlide,1);save();homepage()});
    $$("[data-delete-ad]").forEach(b=>b.onclick=()=>{data.ads.splice(+b.dataset.deleteAd,1);save();homepage()});
  }
  async function listings(){
    const c=window.TROTRO_SUPABASE.client;
    const table=$("#listingTable");
    if(!c||!table)return;
    table.innerHTML='<tr><td colspan="6">Loading listings…</td></tr>';
    const {data,error}=await c.from("listings").select("id,title,category,price,location,images,created_at,status").order("created_at",{ascending:false});
    if(error){table.innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;return;}
    table.innerHTML=(data||[]).map(x=>{const image=Array.isArray(x.images)&&x.images[0]?x.images[0]:"../assets/images/logo.png";return `<tr><td><img src="${esc(image)}" style="width:60px;height:42px;object-fit:cover"></td><td>${esc(x.title)}</td><td>${esc(x.category)}</td><td>GH₵ ${esc(x.price)}</td><td>${esc(x.location)}</td><td><a class="action" href="../listing.html?id=${encodeURIComponent(x.id)}">View</a> <button class="action danger" data-delete="${esc(x.id)}">Delete</button></td></tr>`;}).join("")||'<tr><td colspan="6">No listings found.</td></tr>';
    $$("[data-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this listing?"))return;const id=b.dataset.delete;b.disabled=true;const rr=await c.from("listings").delete().eq("id",id);if(rr.error){alert(rr.error.message);b.disabled=false;return;}await listings();});
  }
  function categories(){
    $("#catTable").innerHTML=data.categories.map((c,i)=>`<tr><td>${esc(c.name)}</td><td>${c.items.length}</td><td><button class="action" data-cat="${i}">Edit</button></td></tr>`).join("");
    $$("[data-cat]").forEach(b=>b.onclick=()=>{const i=+b.dataset.cat;const n=prompt("Category name",data.categories[i].name);if(n!==null){data.categories[i].name=n;save();categories()}});
    $("#addCategory").onclick=()=>{const n=prompt("New category name");if(n){data.categories.push({name:n,items:["Other"]});save();categories()}};
  }
  function settings(){
    const s=data.settings;
    $("#settingsForm").innerHTML=Object.entries(s).map(([k,v])=>`<div class="field" style="margin-bottom:13px"><label>${k}</label><input name="${k}" value="${esc(v)}"></div>`).join("")+`<button class="primary-btn">Save settings</button>`;
    $("#settingsForm").onsubmit=e=>{e.preventDefault();new FormData(e.currentTarget).forEach((v,k)=>data.settings[k]=v);save()};
  }
  async function guardAdmin(){
    const redirect=()=>{location.href=`login.html?next=${encodeURIComponent(location.pathname.split('/').pop()||'index.html')}`;};
    if(!window.TROTRO_SUPABASE || !window.TROTRO_SUPABASE.ready || !window.TROTRO_SUPABASE.client){redirect();return false;}
    const c=window.TROTRO_SUPABASE.client;
    const {data:{session}}=await c.auth.getSession();
    if(!session){redirect();return false;}
    const {data:admins,error}=await c.from("admin_users").select("user_id").eq("user_id",session.user.id).maybeSingle();
    if(error){document.body.style.visibility="visible";const main=$(".admin-main");if(main)main.innerHTML=`<div class="admin-card"><h1>Admin access check failed</h1><p>${esc(error.message)}</p></div>`;return false;}
    if(!admins){await c.auth.signOut();redirect();return false;}
    return true;
  }

  document.addEventListener("DOMContentLoaded",async()=>{
    document.body.style.visibility='hidden';
    try{
      if(!(await guardAdmin())) return;
      document.body.style.visibility='visible';
      shell();
      if($("#stats"))dashboard();
      if($("#slidesEditor"))homepage();
      if($("#listingTable"))listings();
      if($("#catTable"))categories();
      if($("#settingsForm"))settings();
    }catch(e){
      document.body.style.visibility='visible';
      location.href='login.html';
    }
  });
})();
