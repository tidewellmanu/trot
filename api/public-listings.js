export default async function handler(req,res){
  if(req.method!=="GET"){res.status(405).json({error:"Method not allowed"});return;}
  const url="https://zqchpfdrtlfcokwmorln.supabase.co";
  const key="sb_publishable_G1UXSqq0cBmZsXUhd5Zgcw_0afx-Pwg";
  try{
    const upstream=await fetch(url+"/rest/v1/rpc/get_public_active_listings",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json","Content-Type":"application/json"},body:"{}"});
    const text=await upstream.text();
    res.status(upstream.status).setHeader("Cache-Control","no-store").setHeader("Content-Type","application/json").send(text);
  }catch(error){res.status(502).json({error:"Public listings service unavailable."});}
}
