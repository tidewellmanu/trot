export default async function handler(req,res){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }

  const url=process.env.SUPABASE_URL || "https://zqchpfdrtlfcokwmorln.supabase.co";
  const key=process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_G1UXSqq0cBmZsXUhd5Zgcw_0afx-Pwg";

  try{
    const endpoint =
      url +
      "/rest/v1/listings" +
      "?select=*" +
      "&status=eq.active" +
      "&order=created_at.desc";

    const upstream=await fetch(endpoint,{
      method:"GET",
      headers:{
        apikey:key,
        Authorization:"Bearer "+key,
        Accept:"application/json"
      },
      cache:"no-store"
    });

    const text=await upstream.text();

    res
      .status(upstream.status)
      .setHeader("Cache-Control","no-store, no-cache, must-revalidate")
      .setHeader("Content-Type","application/json")
      .send(text);
  }catch(error){
    console.error("Public listings API:",error);
    res.status(502).json({error:"Public listings service unavailable."});
  }
}
