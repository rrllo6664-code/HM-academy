import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://lmlvftoslssbwnoahgxh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0Jltboo6CsmJRLntCtlysw_SltMc7Tb";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);