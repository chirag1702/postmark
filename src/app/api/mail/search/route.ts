import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAIL_SELECT, shapeEmail, type EmailRow } from "@/lib/mail/shape";

interface SearchRankRow {
  id: string;
  rank_order: number;
}

const searchQuerySchema = z
  .object({
    q: z.string().trim().min(1),
    scope: z.enum(["all", "account"]).optional().default("all"),
    mailboxId: z.string().uuid().optional(),
  })
  .refine(
    (v) => v.scope !== "account" || !!v.mailboxId,
    "mailboxId is required when scope=account"
  );

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = searchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { q, scope, mailboxId } = parsed.data;

  const { data: rpcData, error: rpcError } = await supabase.rpc("search_emails", {
    p_query: q,
    p_mailbox_id: scope === "account" ? mailboxId : null,
  });
  if (rpcError) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
  const ranked = rpcData as unknown as SearchRankRow[] | null;
  if (!ranked || ranked.length === 0) {
    return NextResponse.json([]);
  }

  const ids = ranked.map((r) => r.id);
  const { data, error } = await supabase.from("emails").select(MAIL_SELECT).in("id", ids);
  if (error) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  // .in() doesn't preserve input order -- reimpose the RPC's relevance ranking.
  const orderById = new Map(ids.map((id, i) => [id, i]));
  const rows = (data as unknown as EmailRow[]).sort(
    (a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0)
  );

  return NextResponse.json(rows.map(shapeEmail));
}
