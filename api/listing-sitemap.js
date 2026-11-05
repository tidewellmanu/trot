export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).send("Method not allowed");}
  const base=(process.env.SUPABASE_URL||"https://zqchpfdrtlfcokwmorln.supabase.co").replace(/\/+$/,"");
  const key=process.env.SUPABASE_PUBLISHABLE_KEY||"sb_publishable_G1UXSqq0cBmZsXUhd5Zgcw_0afx-Pwg";
  try{
    const rows=[];
    const pageSize=1000;
    for(let offset=0;;offset+=pageSize){
      const url=base+"/rest/v1/listings?select=id,updated_at,created_at&status=eq.active&order=created_at.desc&limit="+pageSize+"&offset="+offset;
      const response=await fetch(url,{headers:{apikey:key,Accept:"application/json"}});
      if(!response.ok)throw new Error("Listings query failed: "+response.status);
      const page=await response.json();
      if(!Array.isArray(page))throw new Error("Unexpected listings response");
      rows.push(...page);
      if(page.length<pageSize)break;
    }
    const urls=rows.filter(row=>row.id).map(row=>{
      const loc="https://trotromall.com/listing/"+encodeURIComponent(row.id);
      const date=row.updated_at||row.created_at;
      return "<url><loc>"+loc+"</loc>"+(date&&!Number.isNaN(Date.parse(date))?"<lastmod>"+new Date(date).toISOString().slice(0,10)+"</lastmod>":"")+"</url>";
    }).join("");
    const xml='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls+"</urlset>";
    return res.status(200).setHeader("Content-Type","application/xml; charset=utf-8").setHeader("Cache-Control","public, max-age=0, s-maxage=300, stale-while-revalidate=900").send(xml);
  }catch(error){
    console.error("Listing sitemap:",error);
    return res.status(502).setHeader("Content-Type","text/plain; charset=utf-8").send("Listing sitemap unavailable");
  }
}