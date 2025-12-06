export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          performed_by: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          acquisition_date: string | null
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          owner_entity: Database["public"]["Enums"]["owner_entity"]
          quantity: number
          storage_location: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          acquisition_date?: string | null
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          owner_entity: Database["public"]["Enums"]["owner_entity"]
          quantity?: number
          storage_location?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          acquisition_date?: string | null
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_entity?: Database["public"]["Enums"]["owner_entity"]
          quantity?: number
          storage_location?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          evm_wallet_address: string | null
          id: string
          name: string | null
          solana_wallet_address: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          evm_wallet_address?: string | null
          id: string
          name?: string | null
          solana_wallet_address?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          evm_wallet_address?: string | null
          id?: string
          name?: string | null
          solana_wallet_address?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proof_of_reserve_files: {
        Row: {
          asset_id: string
          file_hash: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          asset_id: string
          file_hash: string
          file_name: string
          file_type: string
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          asset_id?: string
          file_hash?: string
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_reserve_files_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      token_definitions: {
        Row: {
          asset_id: string
          chain: Database["public"]["Enums"]["blockchain_chain"]
          contract_address: string | null
          created_at: string
          decimals: number
          deployment_status: Database["public"]["Enums"]["deployment_status"]
          id: string
          network: Database["public"]["Enums"]["network_type"]
          notes: string | null
          token_model: Database["public"]["Enums"]["token_model"]
          token_name: string
          token_symbol: string
          total_supply: number
        }
        Insert: {
          asset_id: string
          chain?: Database["public"]["Enums"]["blockchain_chain"]
          contract_address?: string | null
          created_at?: string
          decimals?: number
          deployment_status?: Database["public"]["Enums"]["deployment_status"]
          id?: string
          network?: Database["public"]["Enums"]["network_type"]
          notes?: string | null
          token_model: Database["public"]["Enums"]["token_model"]
          token_name: string
          token_symbol: string
          total_supply?: number
        }
        Update: {
          asset_id?: string
          chain?: Database["public"]["Enums"]["blockchain_chain"]
          contract_address?: string | null
          created_at?: string
          decimals?: number
          deployment_status?: Database["public"]["Enums"]["deployment_status"]
          id?: string
          network?: Database["public"]["Enums"]["network_type"]
          notes?: string | null
          token_model?: Database["public"]["Enums"]["token_model"]
          token_name?: string
          token_symbol?: string
          total_supply?: number
        }
        Relationships: [
          {
            foreignKeyName: "token_definitions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_token_holdings: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          balance: number
          id: string
          token_definition_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          balance?: number
          id?: string
          token_definition_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          balance?: number
          id?: string
          token_definition_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_token_holdings_token_definition_id_fkey"
            columns: ["token_definition_id"]
            isOneToOne: false
            referencedRelation: "token_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "standard_user"
      asset_type:
        | "GOLDBACK"
        | "SILVER"
        | "COPPER"
        | "GOLD_CERTIFICATE"
        | "SILVER_CERTIFICATE"
        | "OTHER"
      blockchain_chain: "ETHEREUM" | "POLYGON" | "BSC" | "SOLANA" | "NONE"
      deployment_status: "NOT_DEPLOYED" | "PENDING" | "DEPLOYED"
      network_type: "MAINNET" | "TESTNET" | "NONE"
      owner_entity: "PERSONAL_TRUST" | "BUSINESS_TRUST" | "SPV_LLC"
      token_model: "ONE_TO_ONE" | "FRACTIONAL" | "VAULT_BASKET"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "standard_user"],
      asset_type: [
        "GOLDBACK",
        "SILVER",
        "COPPER",
        "GOLD_CERTIFICATE",
        "SILVER_CERTIFICATE",
        "OTHER",
      ],
      blockchain_chain: ["ETHEREUM", "POLYGON", "BSC", "SOLANA", "NONE"],
      deployment_status: ["NOT_DEPLOYED", "PENDING", "DEPLOYED"],
      network_type: ["MAINNET", "TESTNET", "NONE"],
      owner_entity: ["PERSONAL_TRUST", "BUSINESS_TRUST", "SPV_LLC"],
      token_model: ["ONE_TO_ONE", "FRACTIONAL", "VAULT_BASKET"],
    },
  },
} as const
