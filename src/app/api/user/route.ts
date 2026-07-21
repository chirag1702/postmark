import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    loginEmail: z.string().trim().email().optional(),
  })
  .refine((data) => data.name !== undefined || data.loginEmail !== undefined, {
    message: "Nothing to update",
  });

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    name: profile.name,
    loginEmail: user.email,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const input = parsed.data;

  if (input.name !== undefined) {
    const { error } = await supabase
      .from("profiles")
      .update({ name: input.name, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: "Failed to update name" }, { status: 500 });
    }
  }

  let emailChangePending = false;
  if (input.loginEmail !== undefined && input.loginEmail !== user.email) {
    const { error } = await supabase.auth.updateUser({ email: input.loginEmail });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    emailChangePending = true;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    id: user.id,
    name: profile?.name ?? input.name ?? "",
    loginEmail: user.email,
    emailChangePending,
  });
}
