import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await db
  .from("price_history")
  .select("price,stock,availability,scraped_at,tracked_product_id")
  .order("scraped_at", { ascending: false })
  .limit(8);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const { count } = await db
  .from("price_history")
  .select("*", { count: "exact", head: true });

console.log(JSON.stringify({ count, latest: data }, null, 2));
