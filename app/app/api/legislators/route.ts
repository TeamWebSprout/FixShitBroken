import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/legislators?chamber=senate&state=TX&party=R&q=smith
 * The production data source for the directory (the static site reads the
 * generated JSON; a deployed Next frontend reads this instead). Returns the
 * same slim shape the worker writes to web/data/legislators.json.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chamber = searchParams.get("chamber");
  const state = searchParams.get("state");
  const party = searchParams.get("party");
  const q = searchParams.get("q");

  try {
    const supabase = createPublicClient();
    let query = supabase
      .from("legislator")
      .select("bioguide_id, full_name, party, state, district, current_chamber, photo_url")
      .eq("in_office", true)
      .order("state", { ascending: true })
      .order("full_name", { ascending: true });

    if (chamber === "house" || chamber === "senate") query = query.eq("current_chamber", chamber);
    if (state) query = query.eq("state", state.toUpperCase());
    if (party) query = query.eq("party", party.toUpperCase());
    if (q) query = query.ilike("full_name", `%${q}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? [], {
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
