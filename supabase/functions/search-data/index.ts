// supabase/functions/search-data/index.ts
// AIU V2.1 Relational Retrieval Edge Function supporting Single & Bulk Search with Output Field Filtering

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  searchMode?: "single" | "bulk";
  searchType: "mobile" | "client_code" | "form_number";
  searchValue?: string;
  values?: string[];
  selectedFields?: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: SearchRequest = await req.json();
    const { searchMode = "single", searchType, searchValue, values = [], selectedFields = [] } = body;

    const targets: string[] = searchMode === "bulk"
      ? Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)))
      : [String(searchValue || "").trim()].filter(Boolean);

    if (targets.length === 0) {
      return new Response(
        JSON.stringify({
          error: "At least one search identifier is required",
          status: "ERROR",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Retrieve records in batches
    const matchedRecordsMap = new Map<string, any>();
    const clientCodes = new Set<string>();
    const formNumbers = new Set<number>();

    if (searchType === "mobile") {
      const { data: addresses } = await supabaseClient
        .from("user_address_details")
        .select("*")
        .in("user_mobile_number", targets);

      (addresses || []).forEach((a: any) => {
        formNumbers.add(Number(a.form_number));
        matchedRecordsMap.set(String(a.user_mobile_number), {
          source: a,
          form_number: Number(a.form_number),
        });
      });
    } else if (searchType === "client_code") {
      targets.forEach((c) => clientCodes.add(c.toUpperCase()));
    } else if (searchType === "form_number") {
      targets.forEach((f) => {
        const num = Number(f);
        if (!isNaN(num)) formNumbers.add(num);
      });
    }

    // Expand relationships:
    // 1. If form numbers known, lookup user_account_information for client_code
    if (formNumbers.size > 0) {
      const { data: accounts } = await supabaseClient
        .from("user_account_information")
        .select("form_number, client_code")
        .in("form_number", Array.from(formNumbers));

      (accounts || []).forEach((acc: any) => {
        if (acc.client_code) clientCodes.add(String(acc.client_code));
      });
    }

    // 2. If client codes known, lookup user_account_information for form_number
    if (clientCodes.size > 0) {
      const { data: accounts } = await supabaseClient
        .from("user_account_information")
        .select("form_number, client_code")
        .in("client_code", Array.from(clientCodes));

      (accounts || []).forEach((acc: any) => {
        if (acc.form_number) formNumbers.add(Number(acc.form_number));
      });
    }

    // Fetch full data across all 5 tables for the resolved keys
    const cCodesArr = Array.from(clientCodes);
    const fNumsArr = Array.from(formNumbers);

    let [uDetails, uAccounts, uAddresses, uPersonal, cDetails] = await Promise.all([
      cCodesArr.length > 0
        ? supabaseClient.from("user_details").select("*").in("client_code", cCodesArr).then((r) => r.data || [])
        : Promise.resolve([]),
      fNumsArr.length > 0
        ? supabaseClient.from("user_account_information").select("*").in("form_number", fNumsArr).then((r) => r.data || [])
        : Promise.resolve([]),
      fNumsArr.length > 0
        ? supabaseClient.from("user_address_details").select("*").in("form_number", fNumsArr).then((r) => r.data || [])
        : Promise.resolve([]),
      fNumsArr.length > 0
        ? supabaseClient.from("user_personal_details").select("*").in("form_number", fNumsArr).then((r) => r.data || [])
        : Promise.resolve([]),
      cCodesArr.length > 0 || fNumsArr.length > 0
        ? supabaseClient.from("client_details").select("*").in("form_number", fNumsArr).then((r) => r.data || [])
        : Promise.resolve([]),
    ]);

    // Build lookup indexes
    const uDetailsByCode = new Map(uDetails.map((u: any) => [String(u.client_code).toUpperCase(), u]));
    const uAccountsByForm = new Map(uAccounts.map((a: any) => [Number(a.form_number), a]));
    const uAccountsByCode = new Map(uAccounts.map((a: any) => [String(a.client_code).toUpperCase(), a]));
    const uAddressesByForm = new Map(uAddresses.map((a: any) => [Number(a.form_number), a]));
    const uPersonalByForm = new Map(uPersonal.map((p: any) => [Number(p.form_number), p]));
    const cDetailsByForm = new Map(cDetails.map((c: any) => [Number(c.form_number), c]));
    const cDetailsByCode = new Map(cDetails.map((c: any) => [String(c.client_code).toUpperCase(), c]));

    // Construct unified response for each target identifier
    const results = targets.map((target) => {
      let resolvedCode: string | null = null;
      let resolvedForm: number | null = null;

      if (searchType === "mobile") {
        const addr = uAddresses.find((a: any) => String(a.user_mobile_number).trim() === target);
        if (addr) {
          resolvedForm = Number(addr.form_number);
          const acc = uAccountsByForm.get(resolvedForm);
          if (acc) resolvedCode = acc.client_code;
        }
      } else if (searchType === "client_code") {
        const cUp = target.toUpperCase();
        if (uDetailsByCode.has(cUp) || uAccountsByCode.has(cUp) || cDetailsByCode.has(cUp)) {
          resolvedCode = cUp;
          const acc = uAccountsByCode.get(cUp);
          if (acc) resolvedForm = Number(acc.form_number);
        }
      } else if (searchType === "form_number") {
        const num = Number(target);
        if (!isNaN(num) && (uAccountsByForm.has(num) || uAddressesByForm.has(num) || uPersonalByForm.has(num))) {
          resolvedForm = num;
          const acc = uAccountsByForm.get(num);
          if (acc) resolvedCode = acc.client_code;
        }
      }

      if (!resolvedCode && !resolvedForm) {
        return {
          identifier: target,
          status: "NO MATCH",
          values: {},
        };
      }

      const ud = resolvedCode ? uDetailsByCode.get(resolvedCode.toUpperCase()) : null;
      const ua = resolvedForm ? uAccountsByForm.get(resolvedForm) : (resolvedCode ? uAccountsByCode.get(resolvedCode.toUpperCase()) : null);
      const uadd = resolvedForm ? uAddressesByForm.get(resolvedForm) : null;
      const up = resolvedForm ? uPersonalByForm.get(resolvedForm) : null;
      const cd = resolvedForm ? cDetailsByForm.get(resolvedForm) : (resolvedCode ? cDetailsByCode.get(resolvedCode.toUpperCase()) : null);

      const mergedRecord = {
        ...(ud || {}),
        ...(ua || {}),
        ...(uadd || {}),
        ...(up || {}),
        ...(cd || {}),
      };

      return {
        identifier: target,
        status: "MATCHED",
        values: mergedRecord,
      };
    });

    return new Response(
      JSON.stringify({
        searchMode,
        searchType,
        totalRequested: targets.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Edge function retrieval failure" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
