/**
 * Supabase adapter - handles communication with Supabase
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "../types";

export class SupabaseAdapter {
  private client: SupabaseClient<any>;
  private tableMapping: Record<string, string>;
  private realtimeSubscriptions: Map<string, any> = new Map();

  constructor(config: SupabaseConfig) {
    this.client = config.client;
    this.tableMapping = config.tables;
  }

  getSupabaseTableName(localTableName: string): string {
    return this.tableMapping[localTableName] || localTableName;
  }

  async pull(tableName: string, lastSyncTimestamp?: number): Promise<any[]> {
    const supabaseTableName = this.getSupabaseTableName(tableName);
    let query = this.client.from(supabaseTableName).select("*");

    // If lastSyncTimestamp is provided, only get records updated after that
    if (lastSyncTimestamp) {
      query = query.gte(
        "updated_at",
        new Date(lastSyncTimestamp).toISOString()
      );
    }

    const { data, error } = await query;

    if (error) {
      // Provide more helpful error messages
      if (
        error.message.includes("Could not find the table") ||
        error.message.includes("schema cache")
      ) {
        throw new Error(
          `Table '${supabaseTableName}' not found in Supabase. ` +
            `Please ensure:\n` +
            `1. The table exists in your Supabase database\n` +
            `2. Row Level Security (RLS) policies allow access\n` +
            `3. The table is in the 'public' schema\n` +
            `4. Your Supabase client has the correct permissions\n` +
            `Original error: ${error.message}`
        );
      }
      throw new Error(
        `Failed to pull from Supabase (table: ${supabaseTableName}): ${error.message}`
      );
    }

    return data || [];
  }

  async push(tableName: string, records: any[]): Promise<void> {
    const supabaseTableName = this.getSupabaseTableName(tableName);

    if (records.length === 0) {
      console.log(`[Localbase] No records to push to '${supabaseTableName}'`);
      return;
    }

    console.log(
      `[Localbase] Attempting to upsert ${records.length} records to Supabase table '${supabaseTableName}'`
    );

    // Batch upsert
    const { error } = await this.client
      .from(supabaseTableName)
      .upsert(records, { onConflict: "id" });

    if (error) {
      console.error(
        `[Localbase] Supabase upsert error for table '${supabaseTableName}':`,
        error
      );
      console.error(
        `[Localbase] First record that failed:`,
        records[0] ? JSON.stringify(records[0], null, 2) : "none"
      );

      if (
        error.message.includes("Could not find the table") ||
        error.message.includes("schema cache")
      ) {
        throw new Error(
          `Table '${supabaseTableName}' not found in Supabase. ` +
            `Please ensure the table exists and is accessible. ` +
            `Original error: ${error.message}`
        );
      }
      throw new Error(
        `Failed to push to Supabase (table: ${supabaseTableName}): ${error.message}`
      );
    }

    console.log(
      `[Localbase] Successfully upserted ${records.length} records to '${supabaseTableName}'`
    );
  }

  async delete(tableName: string, keys: any[]): Promise<void> {
    const supabaseTableName = this.getSupabaseTableName(tableName);

    if (keys.length === 0) {
      return;
    }

    const { error } = await this.client
      .from(supabaseTableName)
      .delete()
      .in("id", keys);

    if (error) {
      if (
        error.message.includes("Could not find the table") ||
        error.message.includes("schema cache")
      ) {
        throw new Error(
          `Table '${supabaseTableName}' not found in Supabase. ` +
            `Please ensure the table exists and is accessible. ` +
            `Original error: ${error.message}`
        );
      }
      throw new Error(
        `Failed to delete from Supabase (table: ${supabaseTableName}): ${error.message}`
      );
    }
  }

  subscribeRealtime(
    tableName: string,
    callback: (payload: any) => void
  ): () => void {
    const supabaseTableName = this.getSupabaseTableName(tableName);

    const subscription = this.client
      .channel(`Localbase:${tableName}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: supabaseTableName,
        },
        callback
      )
      .subscribe();

    this.realtimeSubscriptions.set(tableName, subscription);

    return () => {
      subscription.unsubscribe();
      this.realtimeSubscriptions.delete(tableName);
    };
  }

  unsubscribeAll(): void {
    for (const subscription of this.realtimeSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.realtimeSubscriptions.clear();
  }
}
