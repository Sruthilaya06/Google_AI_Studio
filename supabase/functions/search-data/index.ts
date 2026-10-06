// supabase/functions/search-data/index.ts
// AIU V2 Multi-Identifier Relationship Retrieval Edge Function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchPayload {
  searchType: "mobile" | "pan" | "client_code" | "form_number" | "name";
  searchValue: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: SearchPayload = await req.json();
    const { searchType, searchValue } = body;

    if (!searchValue || !searchValue.trim()) {
      return new Response(
        JSON.stringify({
          error: "Search value is required",
          searchCriteria: searchValue,
          searchType,
          executionStatus: "ERROR",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const cleanVal = searchValue.trim();
    let matchedClientCodes = new Set<string>();
    let matchedFormNumbers = new Set<number>();
    let relationshipPath = "";
    let matchedRecords: any[] = [];

    if (searchType === "mobile") {
      relationshipPath = "user_address_details (user_mobile_number) -> user_account_information (form_number) -> user_details (client_code) -> client_details & user_personal_details";
      const { data: addresses } = await supabaseClient
        .from("user_address_details")
        .select("*")
        .eq("user_mobile_number", cleanVal);

      if (addresses && addresses.length > 0) {
        addresses.forEach((a: any) => {
          matchedFormNumbers.add(Number(a.form_number));
          matchedRecords.push({ ...a, _sourceTable: "user_address_details", _matchReason: "MATCHED: user_mobile_number" });
        });
      }
    } else if (searchType === "pan") {
      relationshipPath = "client_details (client_pan_number) -> client_code & form_number -> user_details, user_account_information, user_personal_details, user_address_details";
      const { data: clients } = await supabaseClient
        .from("client_details")
        .select("*")
        .ilike("client_pan_number", cleanVal);

      if (clients && clients.length > 0) {
        clients.forEach((c: any) => {
          if (c.client_code) matchedClientCodes.add(String(c.client_code));
          if (c.form_number) matchedFormNumbers.add(Number(c.form_number));
          matchedRecords.push({ ...c, _sourceTable: "client_details", _matchReason: "MATCHED: client_pan_number" });
        });
      }
    } else if (searchType === "client_code") {
      relationshipPath = "user_details (client_code) -> user_account_information (R1) -> client_details (R2) -> user_address_details (R3) -> user_personal_details (R4)";
      matchedClientCodes.add(cleanVal);
      const { data: uDetails } = await supabaseClient
        .from("user_details")
        .select("*")
        .ilike("client_code", cleanVal);

      if (uDetails && uDetails.length > 0) {
        uDetails.forEach((u: any) => {
          matchedRecords.push({ ...u, _sourceTable: "user_details", _matchReason: "MATCHED: client_code" });
        });
      }
    } else if (searchType === "form_number") {
      relationshipPath = "user_account_information (form_number) -> user_details (client_code) -> user_address_details (R3), user_personal_details (R4), client_details (R5)";
      const formNum = Number(cleanVal);
      if (!isNaN(formNum)) {
        matchedFormNumbers.add(formNum);
      }
    } else if (searchType === "name") {
      relationshipPath = "user_personal_details (name partial match) -> user_account_information (form_number) -> user_details (client_code) -> user_address_details & client_details";
      const { data: personals } = await supabaseClient
        .from("user_personal_details")
        .select("*")
        .or(`user_first_name.ilike.%${cleanVal}%,user_last_name.ilike.%${cleanVal}%,user_middle_name.ilike.%${cleanVal}%`);

      if (personals && personals.length > 0) {
        personals.forEach((p: any) => {
          matchedFormNumbers.add(Number(p.form_number));
          matchedRecords.push({ ...p, _sourceTable: "user_personal_details", _matchReason: "MATCHED: name query" });
        });
      }
    }

    // Traverse relationships to retrieve all related records
    // 1. If form numbers found, fetch user_account_information to get client_code
    if (matchedFormNumbers.size > 0) {
      const formArr = Array.from(matchedFormNumbers);
      const { data: accounts } = await supabaseClient
        .from("user_account_information")
        .select("*")
        .in("form_number", formArr);

      if (accounts) {
        accounts.forEach((acc: any) => {
          if (acc.client_code) matchedClientCodes.add(String(acc.client_code));
        });
      }
    }

    // 2. If client codes found, fetch user_account_information to expand form numbers
    if (matchedClientCodes.size > 0) {
      const clientArr = Array.from(matchedClientCodes);
      const { data: accounts } = await supabaseClient
        .from("user_account_information")
        .select("*")
        .in("client_code", clientArr);

      if (accounts) {
        accounts.forEach((acc: any) => {
          if (acc.form_number) matchedFormNumbers.add(Number(acc.form_number));
        });
      }
    }

    // Retrieve full data across all 5 tables
    const clientCodesArr = Array.from(matchedClientCodes);
    const formNumbersArr = Array.from(matchedFormNumbers);

    let userDetailsList: any[] = [];
    let accountInfoList: any[] = [];
    let addressList: any[] = [];
    let personalList: any[] = [];
    let clientDetailsList: any[] = [];

    if (clientCodesArr.length > 0) {
      const { data } = await supabaseClient.from("user_details").select("*").in("client_code", clientCodesArr);
      userDetailsList = data || [];
    }
    if (formNumbersArr.length > 0 || clientCodesArr.length > 0) {
      let query = supabaseClient.from("user_account_information").select("*");
      if (formNumbersArr.length > 0) query = query.in("form_number", formNumbersArr);
      else if (clientCodesArr.length > 0) query = query.in("client_code", clientCodesArr);
      const { data } = await query;
      accountInfoList = data || [];
    }
    if (formNumbersArr.length > 0) {
      const { data: addrs } = await supabaseClient.from("user_address_details").select("*").in("form_number", formNumbersArr);
      addressList = addrs || [];
      const { data: pers } = await supabaseClient.from("user_personal_details").select("*").in("form_number", formNumbersArr);
      personalList = pers || [];
    }
    if (clientCodesArr.length > 0 || formNumbersArr.length > 0) {
      let query = supabaseClient.from("client_details").select("*");
      if (clientCodesArr.length > 0) query = query.in("client_code", clientCodesArr);
      else if (formNumbersArr.length > 0) query = query.in("form_number", formNumbersArr);
      const { data } = await query;
      clientDetailsList = data || [];
    }

    const totalRecordsFound =
      userDetailsList.length +
      accountInfoList.length +
      addressList.length +
      personalList.length +
      clientDetailsList.length;

    let tablesCount = 0;
    if (userDetailsList.length > 0) tablesCount++;
    if (accountInfoList.length > 0) tablesCount++;
    if (addressList.length > 0) tablesCount++;
    if (personalList.length > 0) tablesCount++;
    if (clientDetailsList.length > 0) tablesCount++;

    const status = totalRecordsFound > 0 ? "MATCHED" : "NO MATCH";

    const response = {
      searchCriteria: cleanVal,
      searchType,
      executionStatus: "SUCCESS",
      validationStatus: totalRecordsFound > 0 ? "PASS" : "N/A",
      tablesReturned: tablesCount,
      relationshipPaths: relationshipPath,
      recordCounts: {
        user_details: userDetailsList.length,
        user_account_information: accountInfoList.length,
        user_address_details: addressList.length,
        user_personal_details: personalList.length,
        client_details: clientDetailsList.length,
        total: totalRecordsFound,
      },
      data: {
        user_details: userDetailsList,
        user_account_information: accountInfoList,
        user_address_details: addressList,
        user_personal_details: personalList,
        client_details: clientDetailsList,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: err.message || "Retrieval execution error",
        executionStatus: "ERROR",
        validationStatus: "FAIL",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
