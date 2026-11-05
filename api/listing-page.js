function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function clean(value){
  return String(value??"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function imageUrl(value,base){
  if(!value)return "";
  let path=typeof value==="object"?(value.url||value.src||value.publicUrl||value.public_url||value.image_url||value.storage_path||value.path||""):value;
  path=String(path).trim();
  if(!path)return "";
  if(/^https?:\/\//i.test(path))return path;
  const root=base.replace(/\/+$/,"");
  if(/^\/storage\/v1\/object\/public\//i.test(path))return root+path;
  path=path.replace(/^\/+/,"").replace(/^storage\/v1\/object\/public\//i,"").replace(/^public\//i,"").replace(/^listing-photos\//i,"");
  return root+"/storage/v1/object/public/listing-photos/"+path.split("/").map(encodeURIComponent).join("/");
}
function parseImages(value,base){
  let raw=[];
  if(Array.isArray(value))raw=value;
  else if(typeof value==="string"&&value.trim()){
    try{const parsed=JSON.parse(value);raw=Array.isArray(parsed)?parsed:[parsed];}
    catch(_){raw=value.startsWith("{")&&value.endsWith("}")?value.slice(1,-1).split(",").map(x=>x.trim().replace(/^["']|["']$/g,"")):[value];}
  }
  return [...new Set(raw.map(x=>imageUrl(x,base)).filter(Boolean))];
}
export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).send("Method not allowed");}
  const id=String(req.query.id||"").trim();
  if(!id||id.length>128)return res.status(400).send("Invalid listing ID");
  const base=(process.env.SUPABASE_URL||"https://zqchpfdrtlfcokwmorln.supabase.co").replace(/\/+$/,"");
  const key=process.env.SUPABASE_PUBLISHABLE_KEY||"sb_publishable_G1UXSqq0cBmZsXUhd5Zgcw_0afx-Pwg";
  try{
    const headers={apikey:key,Accept:"application/json"};
    const listingUrl=base+"/rest/v1/listings?select=*&id=eq."+encodeURIComponent(id)+"&status=eq.active&limit=1";
    const listingResponse=await fetch(listingUrl,{headers});
    if(!listingResponse.ok)throw new Error("Listing query failed: "+listingResponse.status);
    const rows=await listingResponse.json();
    const item=Array.isArray(rows)?rows[0]:null;
    if(!item)return res.status(404).setHeader("Cache-Control","public, max-age=60").send("Listing not found");
    let images=parseImages(item.images,base).concat(parseImages(item.image_urls,base));
    if(item.image)images.push(imageUrl(item.image,base));
    try{
      const ir=await fetch(base+"/rest/v1/listing_images?select=storage_path,position&listing_id=eq."+encodeURIComponent(id)+"&order=position.asc",{headers});
      if(ir.ok){const imageRows=await ir.json();images=images.concat((imageRows||[]).map(row=>imageUrl(row.storage_path,base)));}
    }catch(_){}
    images=[...new Set(images.filter(Boolean))];
    const title=clean(item.title)||"Marketplace listing";
    const location=clean(item.location)||"Ghana";
    const category=clean(item.category);
    const description=(title+" in "+location+", Ghana. "+(clean(item.description)||"Browse this listing on TrotroMall.")+(item.price!==undefined&&item.price!==null&&String(item.price).trim()?" Price: GH₵ "+clean(item.price)+".":"")).slice(0,160);
    const canonical="https://trotromall.com/listing/"+encodeURIComponent(id);
    const image=images[0]||"https://trotromall.com/assets/images/logo.png";
    const alt=title+" listed in "+location+", Ghana";
    const numericPrice=Number(String(item.price??"").replace(/[^0-9.]/g,""));
    const excluded=/property|jobs|services|rentals/i.test(category);
    let structured="";
    if(!excluded){
      const product={"@context":"https://schema.org","@type":"Product","name":title,"description":description,"image":images.length?images:[image],"sku":String(item.id),"category":category,"itemCondition":/new/i.test(item.condition||"")?"https://schema.org/NewCondition":"https://schema.org/UsedCondition","offers":{"@type":"Offer","url":canonical,"priceCurrency":"GHS","availability":"https://schema.org/InStock","seller":{"@type":"Person","name":clean(item.seller_name||item.seller)||"TrotroMall seller"}}};
      if(Number.isFinite(numericPrice)&&numericPrice>=0)product.offers.price=numericPrice.toFixed(2);else delete product.offers;
      structured='<script id="listingStructuredData" type="application/ld+json">'+JSON.stringify(product).replace(/</g,"\\u003c")+'</script>';
    }
    const gallery=images.map((src,index)=>'<img src="'+escapeHtml(src)+'" alt="'+escapeHtml(title+" in "+location+", Ghana — photo "+(index+1))+'">').join("");
    const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="/"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(title+" in "+location+" | TrotroMall Ghana")+'</title><meta name="description" content="'+escapeHtml(description)+'"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="'+escapeHtml(canonical)+'"><meta property="og:type" content="website"><meta property="og:site_name" content="TrotroMall"><meta property="og:title" content="'+escapeHtml(title+" in "+location+" | TrotroMall Ghana")+'"><meta property="og:description" content="'+escapeHtml(description)+'"><meta property="og:url" content="'+escapeHtml(canonical)+'"><meta property="og:image" content="'+escapeHtml(image)+'"><meta property="og:image:alt" content="'+escapeHtml(alt)+'"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+escapeHtml(title+" in "+location+" | TrotroMall Ghana")+'"><meta name="twitter:description" content="'+escapeHtml(description)+'"><meta name="twitter:image" content="'+escapeHtml(image)+'">'+structured+'<link rel="icon" href="/assets/images/favicon.png"><link rel="stylesheet" href="/assets/css/style.css"></head><body><div id="siteHeader"></div><main class="page"><div class="container"><div class="listing-page" id="listing"><h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(description)+'</p><div class="seo-listing-images">'+gallery+'</div><p>Price: GH₵ '+escapeHtml(item.price)+'</p><p>Location: '+escapeHtml(location)+', Ghana</p></div></div></main><div id="siteFooter"></div><script defer src="/assets/js/data.js"></script><script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script defer src="/assets/js/config.js"></script><script defer src="/assets/js/supabase-client.js"></script><script defer src="/assets/js/app.js"></script></body></html>';
    return res.status(200).setHeader("Content-Type","text/html; charset=utf-8").setHeader("Cache-Control","public, max-age=0, s-maxage=60, stale-while-revalidate=300").send(html);
  }catch(error){
    console.error("SEO listing page:",error);
    return res.status(502).setHeader("Content-Type","text/plain; charset=utf-8").send("Listing temporarily unavailable");
  }
}