/* Production Supabase discovery example. This is intentionally separate from the
   localStorage demo renderer so the static project remains usable without a backend. */
window.TrotroDiscovery = {
  async featuredAndLatest(limit=24){
    if(!window.TROTRO_SUPABASE?.ready) throw new Error('Supabase client is not configured.');
    const {data,error}=await window.TROTRO_SUPABASE.client
      .from('marketplace_discovery')
      .select('*')
      .order('active_featured',{ascending:false})
      .order('created_at',{ascending:false})
      .limit(limit);
    if(error) throw error;
    return data || [];
  },
  async byCategory(category,limit=24){
    if(!window.TROTRO_SUPABASE?.ready) throw new Error('Supabase client is not configured.');
    const {data,error}=await window.TROTRO_SUPABASE.client
      .from('marketplace_discovery')
      .select('*')
      .eq('category',category)
      .order('active_featured',{ascending:false})
      .order('created_at',{ascending:false})
      .limit(limit);
    if(error) throw error;
    return data || [];
  }
};
