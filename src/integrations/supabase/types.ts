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
      activity_rewards: {
        Row: {
          action_type: string
          created_at: string | null
          distributed_at: string | null
          entity_id: string | null
          id: string
          mxg_amount: number
          reward_type: string
          status: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          distributed_at?: string | null
          entity_id?: string | null
          id?: string
          mxg_amount: number
          reward_type: string
          status?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          distributed_at?: string | null
          entity_id?: string | null
          id?: string
          mxg_amount?: number
          reward_type?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      arbitrage_runs: {
        Row: {
          actual_profit_lamports: number | null
          approved_for_auto_execution: boolean
          auto_executed: boolean
          created_at: string
          error_message: string | null
          estimated_gas_cost_native: number | null
          estimated_profit_lamports: number | null
          finished_at: string | null
          flash_loan_amount: string | null
          flash_loan_fee: string | null
          flash_loan_provider: string | null
          id: string
          purpose: string | null
          run_type: string | null
          started_at: string
          status: Database["public"]["Enums"]["arbitrage_run_status"]
          strategy_id: string
          tx_signature: string | null
          updated_at: string
          used_flash_loan: boolean | null
        }
        Insert: {
          actual_profit_lamports?: number | null
          approved_for_auto_execution?: boolean
          auto_executed?: boolean
          created_at?: string
          error_message?: string | null
          estimated_gas_cost_native?: number | null
          estimated_profit_lamports?: number | null
          finished_at?: string | null
          flash_loan_amount?: string | null
          flash_loan_fee?: string | null
          flash_loan_provider?: string | null
          id?: string
          purpose?: string | null
          run_type?: string | null
          started_at?: string
          status: Database["public"]["Enums"]["arbitrage_run_status"]
          strategy_id: string
          tx_signature?: string | null
          updated_at?: string
          used_flash_loan?: boolean | null
        }
        Update: {
          actual_profit_lamports?: number | null
          approved_for_auto_execution?: boolean
          auto_executed?: boolean
          created_at?: string
          error_message?: string | null
          estimated_gas_cost_native?: number | null
          estimated_profit_lamports?: number | null
          finished_at?: string | null
          flash_loan_amount?: string | null
          flash_loan_fee?: string | null
          flash_loan_provider?: string | null
          id?: string
          purpose?: string | null
          run_type?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["arbitrage_run_status"]
          strategy_id?: string
          tx_signature?: string | null
          updated_at?: string
          used_flash_loan?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "arbitrage_runs_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      arbitrage_strategies: {
        Row: {
          chain_type: string
          created_at: string
          dex_a: string
          dex_b: string
          evm_network: string | null
          flash_loan_amount_native: number | null
          flash_loan_fee_bps: number | null
          flash_loan_provider: string | null
          flash_loan_token: string | null
          id: string
          is_auto_enabled: boolean
          is_enabled: boolean
          is_for_fee_payer_refill: boolean
          is_for_ops_refill: boolean
          max_daily_loss_native: number
          max_trade_value_native: number | null
          max_trades_per_day: number
          min_expected_profit_native: number
          min_profit_lamports: number
          min_profit_to_gas_ratio: number
          name: string
          token_in_mint: string
          token_out_mint: string
          updated_at: string
          use_flash_loan: boolean | null
        }
        Insert: {
          chain_type?: string
          created_at?: string
          dex_a: string
          dex_b: string
          evm_network?: string | null
          flash_loan_amount_native?: number | null
          flash_loan_fee_bps?: number | null
          flash_loan_provider?: string | null
          flash_loan_token?: string | null
          id?: string
          is_auto_enabled?: boolean
          is_enabled?: boolean
          is_for_fee_payer_refill?: boolean
          is_for_ops_refill?: boolean
          max_daily_loss_native?: number
          max_trade_value_native?: number | null
          max_trades_per_day?: number
          min_expected_profit_native?: number
          min_profit_lamports?: number
          min_profit_to_gas_ratio?: number
          name: string
          token_in_mint: string
          token_out_mint: string
          updated_at?: string
          use_flash_loan?: boolean | null
        }
        Update: {
          chain_type?: string
          created_at?: string
          dex_a?: string
          dex_b?: string
          evm_network?: string | null
          flash_loan_amount_native?: number | null
          flash_loan_fee_bps?: number | null
          flash_loan_provider?: string | null
          flash_loan_token?: string | null
          id?: string
          is_auto_enabled?: boolean
          is_enabled?: boolean
          is_for_fee_payer_refill?: boolean
          is_for_ops_refill?: boolean
          max_daily_loss_native?: number
          max_trade_value_native?: number | null
          max_trades_per_day?: number
          min_expected_profit_native?: number
          min_profit_lamports?: number
          min_profit_to_gas_ratio?: number
          name?: string
          token_in_mint?: string
          token_out_mint?: string
          updated_at?: string
          use_flash_loan?: boolean | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          acquisition_date: string | null
          archived_at: string | null
          archived_by: string | null
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          owner_entity: Database["public"]["Enums"]["owner_entity"]
          quantity: number
          storage_location: string | null
          submitted_by: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          acquisition_date?: string | null
          archived_at?: string | null
          archived_by?: string | null
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          owner_entity: Database["public"]["Enums"]["owner_entity"]
          quantity?: number
          storage_location?: string | null
          submitted_by?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          acquisition_date?: string | null
          archived_at?: string | null
          archived_by?: string | null
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_entity?: Database["public"]["Enums"]["owner_entity"]
          quantity?: number
          storage_location?: string | null
          submitted_by?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      attestations: {
        Row: {
          asset_id: string
          attestation_date: string
          attested_by: string | null
          created_at: string
          id: string
          notes: string | null
          proof_file_ids: string[] | null
          status: Database["public"]["Enums"]["attestation_status"]
          updated_at: string
          verification_hash: string | null
        }
        Insert: {
          asset_id: string
          attestation_date?: string
          attested_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          proof_file_ids?: string[] | null
          status?: Database["public"]["Enums"]["attestation_status"]
          updated_at?: string
          verification_hash?: string | null
        }
        Update: {
          asset_id?: string
          attestation_date?: string
          attested_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          proof_file_ids?: string[] | null
          status?: Database["public"]["Enums"]["attestation_status"]
          updated_at?: string
          verification_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attestations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          created_at: string
          cycle_finished_at: string | null
          cycle_started_at: string
          decision_result: Json | null
          error_message: string | null
          execution_result: Json | null
          id: string
          overall_status: string
          scan_evm_result: Json | null
          scan_solana_result: Json | null
          trigger_type: string
          wallet_check_result: Json | null
        }
        Insert: {
          created_at?: string
          cycle_finished_at?: string | null
          cycle_started_at?: string
          decision_result?: Json | null
          error_message?: string | null
          execution_result?: Json | null
          id?: string
          overall_status?: string
          scan_evm_result?: Json | null
          scan_solana_result?: Json | null
          trigger_type?: string
          wallet_check_result?: Json | null
        }
        Update: {
          created_at?: string
          cycle_finished_at?: string | null
          cycle_started_at?: string
          decision_result?: Json | null
          error_message?: string | null
          execution_result?: Json | null
          id?: string
          overall_status?: string
          scan_evm_result?: Json | null
          scan_solana_result?: Json | null
          trigger_type?: string
          wallet_check_result?: Json | null
        }
        Relationships: []
      }
      daily_risk_limits: {
        Row: {
          chain: string
          created_at: string
          date: string
          id: string
          strategy_id: string
          total_loss_native: number
          total_pnl_native: number
          total_trades: number
          updated_at: string
        }
        Insert: {
          chain: string
          created_at?: string
          date: string
          id?: string
          strategy_id: string
          total_loss_native?: number
          total_pnl_native?: number
          total_trades?: number
          updated_at?: string
        }
        Update: {
          chain?: string
          created_at?: string
          date?: string
          id?: string
          strategy_id?: string
          total_loss_native?: number
          total_pnl_native?: number
          total_trades?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_risk_limits_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      detected_pools: {
        Row: {
          arbitrage_attempted: boolean | null
          arbitrage_result: string | null
          chain: string
          created_block: number | null
          detected_at: string
          dex: string
          first_trade_at: string | null
          id: string
          is_rug_risk: boolean | null
          liquidity_usd: number | null
          pool_address: string
          rug_risk_reasons: string[] | null
          status: string
          token0_address: string
          token0_symbol: string | null
          token1_address: string
          token1_symbol: string | null
          updated_at: string
        }
        Insert: {
          arbitrage_attempted?: boolean | null
          arbitrage_result?: string | null
          chain?: string
          created_block?: number | null
          detected_at?: string
          dex: string
          first_trade_at?: string | null
          id?: string
          is_rug_risk?: boolean | null
          liquidity_usd?: number | null
          pool_address: string
          rug_risk_reasons?: string[] | null
          status?: string
          token0_address: string
          token0_symbol?: string | null
          token1_address: string
          token1_symbol?: string | null
          updated_at?: string
        }
        Update: {
          arbitrage_attempted?: boolean | null
          arbitrage_result?: string | null
          chain?: string
          created_block?: number | null
          detected_at?: string
          dex?: string
          first_trade_at?: string | null
          id?: string
          is_rug_risk?: boolean | null
          liquidity_usd?: number | null
          pool_address?: string
          rug_risk_reasons?: string[] | null
          status?: string
          token0_address?: string
          token0_symbol?: string | null
          token1_address?: string
          token1_symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      enterprise_accounts: {
        Row: {
          annual_fee_cents: number
          api_access_enabled: boolean
          billing_contact_email: string | null
          billing_contact_name: string | null
          contract_end_date: string | null
          contract_reference: string
          contract_start_date: string
          created_at: string
          created_by: string | null
          custom_asset_classes: string[] | null
          id: string
          is_active: boolean
          notes: string | null
          organization_name: string
          updated_at: string
          white_label_enabled: boolean
        }
        Insert: {
          annual_fee_cents: number
          api_access_enabled?: boolean
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          contract_end_date?: string | null
          contract_reference: string
          contract_start_date: string
          created_at?: string
          created_by?: string | null
          custom_asset_classes?: string[] | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_name: string
          updated_at?: string
          white_label_enabled?: boolean
        }
        Update: {
          annual_fee_cents?: number
          api_access_enabled?: boolean
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          contract_end_date?: string | null
          contract_reference?: string
          contract_start_date?: string
          created_at?: string
          created_by?: string | null
          custom_asset_classes?: string[] | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_name?: string
          updated_at?: string
          white_label_enabled?: boolean
        }
        Relationships: []
      }
      enterprise_invoices: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          due_date: string
          enterprise_account_id: string
          id: string
          invoice_number: string
          paid_at: string | null
          payment_reference: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description: string
          due_date: string
          enterprise_account_id: string
          id?: string
          invoice_number: string
          paid_at?: string | null
          payment_reference?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          due_date?: string
          enterprise_account_id?: string
          id?: string
          invoice_number?: string
          paid_at?: string | null
          payment_reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_invoices_enterprise_account_id_fkey"
            columns: ["enterprise_account_id"]
            isOneToOne: false
            referencedRelation: "enterprise_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_users: {
        Row: {
          added_at: string
          added_by: string | null
          enterprise_account_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          enterprise_account_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          enterprise_account_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_users_enterprise_account_id_fkey"
            columns: ["enterprise_account_id"]
            isOneToOne: false
            referencedRelation: "enterprise_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      evm_fee_payer_keys: {
        Row: {
          balance_native: number | null
          created_at: string
          id: string
          is_active: boolean
          is_generated: boolean
          label: string
          last_used_at: string | null
          network: string
          public_key: string
          secret_key_encrypted: string | null
          usage_count: number
        }
        Insert: {
          balance_native?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_generated?: boolean
          label: string
          last_used_at?: string | null
          network?: string
          public_key: string
          secret_key_encrypted?: string | null
          usage_count?: number
        }
        Update: {
          balance_native?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_generated?: boolean
          label?: string
          last_used_at?: string | null
          network?: string
          public_key?: string
          secret_key_encrypted?: string | null
          usage_count?: number
        }
        Relationships: []
      }
      evm_fee_payer_topups: {
        Row: {
          amount_wei: string
          created_at: string
          fee_payer_public_key: string
          id: string
          network: string
          tx_hash: string | null
        }
        Insert: {
          amount_wei: string
          created_at?: string
          fee_payer_public_key: string
          id?: string
          network: string
          tx_hash?: string | null
        }
        Update: {
          amount_wei?: string
          created_at?: string
          fee_payer_public_key?: string
          id?: string
          network?: string
          tx_hash?: string | null
        }
        Relationships: []
      }
      fee_catalog: {
        Row: {
          amount_cents: number
          applies_to: string | null
          created_at: string
          description: string | null
          enabled: boolean
          fee_key: string
          fee_type: string | null
          id: string
          intro_price: boolean | null
          tier: string
        }
        Insert: {
          amount_cents: number
          applies_to?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          fee_key: string
          fee_type?: string | null
          id?: string
          intro_price?: boolean | null
          tier: string
        }
        Update: {
          amount_cents?: number
          applies_to?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          fee_key?: string
          fee_type?: string | null
          id?: string
          intro_price?: boolean | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_catalog_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["tier_key"]
          },
        ]
      }
      fee_discount_tiers: {
        Row: {
          created_at: string
          discount_percentage: number
          id: string
          min_balance: number
          tier_name: string
          token_definition_id: string
        }
        Insert: {
          created_at?: string
          discount_percentage: number
          id?: string
          min_balance: number
          tier_name: string
          token_definition_id: string
        }
        Update: {
          created_at?: string
          discount_percentage?: number
          id?: string
          min_balance?: number
          tier_name?: string
          token_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_discount_tiers_token_definition_id_fkey"
            columns: ["token_definition_id"]
            isOneToOne: false
            referencedRelation: "token_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payer_keys: {
        Row: {
          balance_sol: number | null
          created_at: string
          id: string
          is_active: boolean
          is_generated: boolean
          label: string
          last_used_at: string | null
          public_key: string
          secret_key_encrypted: string | null
          usage_count: number
        }
        Insert: {
          balance_sol?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_generated?: boolean
          label: string
          last_used_at?: string | null
          public_key: string
          secret_key_encrypted?: string | null
          usage_count?: number
        }
        Update: {
          balance_sol?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_generated?: boolean
          label?: string
          last_used_at?: string | null
          public_key?: string
          secret_key_encrypted?: string | null
          usage_count?: number
        }
        Relationships: []
      }
      fee_payer_topups: {
        Row: {
          amount_lamports: number
          created_at: string
          fee_payer_public_key: string
          id: string
          tx_signature: string | null
        }
        Insert: {
          amount_lamports: number
          created_at?: string
          fee_payer_public_key: string
          id?: string
          tx_signature?: string | null
        }
        Update: {
          amount_lamports?: number
          created_at?: string
          fee_payer_public_key?: string
          id?: string
          tx_signature?: string | null
        }
        Relationships: []
      }
      fee_versions: {
        Row: {
          changed_by: string | null
          created_at: string
          effective_date: string
          fee_key: string
          id: string
          new_amount_cents: number
          old_amount_cents: number
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          fee_key: string
          id?: string
          new_amount_cents: number
          old_amount_cents: number
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          fee_key?: string
          id?: string
          new_amount_cents?: number
          old_amount_cents?: number
          reason?: string | null
        }
        Relationships: []
      }
      flash_loan_providers: {
        Row: {
          chain: string
          contract_address: string
          created_at: string | null
          display_name: string
          fee_bps: number
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          max_loan_amount_native: number | null
          name: string
          pool_address: string | null
          receiver_contract_address: string | null
          supported_tokens: string[] | null
          updated_at: string | null
          verified_at: string | null
        }
        Insert: {
          chain: string
          contract_address: string
          created_at?: string | null
          display_name: string
          fee_bps?: number
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          max_loan_amount_native?: number | null
          name: string
          pool_address?: string | null
          receiver_contract_address?: string | null
          supported_tokens?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
        }
        Update: {
          chain?: string
          contract_address?: string
          created_at?: string | null
          display_name?: string
          fee_bps?: number
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          max_loan_amount_native?: number | null
          name?: string
          pool_address?: string | null
          receiver_contract_address?: string | null
          supported_tokens?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      governance_proposals: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          execution_data: Json | null
          id: string
          pass_threshold_percentage: number
          proposal_type: Database["public"]["Enums"]["proposal_type"]
          quorum_percentage: number
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at: string
          votes_abstain: number
          votes_against: number
          votes_for: number
          voting_ends_at: string | null
          voting_starts_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          execution_data?: Json | null
          id?: string
          pass_threshold_percentage?: number
          proposal_type?: Database["public"]["Enums"]["proposal_type"]
          quorum_percentage?: number
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at?: string
          votes_abstain?: number
          votes_against?: number
          votes_for?: number
          voting_ends_at?: string | null
          voting_starts_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          execution_data?: Json | null
          id?: string
          pass_threshold_percentage?: number
          proposal_type?: Database["public"]["Enums"]["proposal_type"]
          quorum_percentage?: number
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          updated_at?: string
          votes_abstain?: number
          votes_against?: number
          votes_for?: number
          voting_ends_at?: string | null
          voting_starts_at?: string | null
        }
        Relationships: []
      }
      marketplace_orders: {
        Row: {
          created_at: string
          expires_at: string | null
          filled_quantity: number
          id: string
          order_type: Database["public"]["Enums"]["order_type"]
          price_per_token: number
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          token_definition_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          filled_quantity?: number
          id?: string
          order_type: Database["public"]["Enums"]["order_type"]
          price_per_token: number
          quantity: number
          status?: Database["public"]["Enums"]["order_status"]
          token_definition_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          filled_quantity?: number
          id?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          price_per_token?: number
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          token_definition_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_token_definition_id_fkey"
            columns: ["token_definition_id"]
            isOneToOne: false
            referencedRelation: "token_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_trades: {
        Row: {
          buy_order_id: string
          buyer_id: string
          executed_at: string
          id: string
          price_per_token: number
          quantity: number
          sell_order_id: string
          seller_id: string
          token_definition_id: string
        }
        Insert: {
          buy_order_id: string
          buyer_id: string
          executed_at?: string
          id?: string
          price_per_token: number
          quantity: number
          sell_order_id: string
          seller_id: string
          token_definition_id: string
        }
        Update: {
          buy_order_id?: string
          buyer_id?: string
          executed_at?: string
          id?: string
          price_per_token?: number
          quantity?: number
          sell_order_id?: string
          seller_id?: string
          token_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_trades_buy_order_id_fkey"
            columns: ["buy_order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_trades_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_trades_sell_order_id_fkey"
            columns: ["sell_order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_trades_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_trades_token_definition_id_fkey"
            columns: ["token_definition_id"]
            isOneToOne: false
            referencedRelation: "token_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      nda_signatures: {
        Row: {
          blockchain_recorded_at: string | null
          blockchain_tx_signature: string | null
          created_at: string
          id: string
          ip_address: string | null
          nda_version: string
          signature_hash: string
          signed_at: string
          signer_email: string
          signer_name: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          blockchain_recorded_at?: string | null
          blockchain_tx_signature?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          nda_version?: string
          signature_hash: string
          signed_at?: string
          signer_email: string
          signer_name: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          blockchain_recorded_at?: string | null
          blockchain_tx_signature?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          nda_version?: string
          signature_hash?: string
          signed_at?: string
          signer_email?: string
          signer_name?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_pinned: boolean | null
          is_published: boolean | null
          published_at: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean | null
          is_published?: boolean | null
          published_at?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean | null
          is_published?: boolean | null
          published_at?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ops_arbitrage_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          chain: string
          created_at: string
          details_json: Json | null
          expected_net_profit: string | null
          gas_spent: string | null
          id: string
          network: string
          realized_profit: string | null
          run_id: string | null
          severity: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          chain?: string
          created_at?: string
          details_json?: Json | null
          expected_net_profit?: string | null
          gas_spent?: string | null
          id?: string
          network?: string
          realized_profit?: string | null
          run_id?: string | null
          severity?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          chain?: string
          created_at?: string
          details_json?: Json | null
          expected_net_profit?: string | null
          gas_spent?: string | null
          id?: string
          network?: string
          realized_profit?: string | null
          run_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_arbitrage_alerts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ops_arbitrage_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_arbitrage_events: {
        Row: {
          chain: string
          created_at: string
          effective_gas_price: string | null
          error_message: string | null
          expected_gross_profit: string | null
          expected_net_profit: string | null
          gas_used: string | null
          id: string
          mode: string
          network: string
          notional_in: string | null
          realized_profit: string | null
          run_id: string | null
          status: string
          strategy_id: string | null
          tx_hash: string | null
        }
        Insert: {
          chain?: string
          created_at?: string
          effective_gas_price?: string | null
          error_message?: string | null
          expected_gross_profit?: string | null
          expected_net_profit?: string | null
          gas_used?: string | null
          id?: string
          mode?: string
          network?: string
          notional_in?: string | null
          realized_profit?: string | null
          run_id?: string | null
          status?: string
          strategy_id?: string | null
          tx_hash?: string | null
        }
        Update: {
          chain?: string
          created_at?: string
          effective_gas_price?: string | null
          error_message?: string | null
          expected_gross_profit?: string | null
          expected_net_profit?: string | null
          gas_used?: string | null
          id?: string
          mode?: string
          network?: string
          notional_in?: string | null
          realized_profit?: string | null
          run_id?: string | null
          status?: string
          strategy_id?: string | null
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_arbitrage_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_arbitrage_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          discount_percentage: number | null
          discount_tier: string | null
          id: string
          metadata: Json | null
          original_amount_cents: number | null
          purpose: string
          related_id: string | null
          related_table: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          discount_percentage?: number | null
          discount_tier?: string | null
          id?: string
          metadata?: Json | null
          original_amount_cents?: number | null
          purpose: string
          related_id?: string | null
          related_table?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          discount_percentage?: number | null
          discount_tier?: string | null
          id?: string
          metadata?: Json | null
          original_amount_cents?: number | null
          purpose?: string
          related_id?: string | null
          related_table?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_tiers: {
        Row: {
          annual_fee_cents: number | null
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          tier_key: string
        }
        Insert: {
          annual_fee_cents?: number | null
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          tier_key: string
        }
        Update: {
          annual_fee_cents?: number | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          tier_key?: string
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
          pricing_tier: string | null
          solana_wallet_address: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          evm_wallet_address?: string | null
          id: string
          name?: string | null
          pricing_tier?: string | null
          solana_wallet_address?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          evm_wallet_address?: string | null
          id?: string
          name?: string | null
          pricing_tier?: string | null
          solana_wallet_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pricing_tier_fkey"
            columns: ["pricing_tier"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["tier_key"]
          },
        ]
      }
      proof_of_reserve_files: {
        Row: {
          asset_id: string
          description: string | null
          file_hash: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          title: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          asset_id: string
          description?: string | null
          file_hash: string
          file_name: string
          file_type: string
          file_url: string
          id?: string
          title?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          asset_id?: string
          description?: string | null
          file_hash?: string
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          title?: string | null
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
      proposal_votes: {
        Row: {
          id: string
          proposal_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voted_at: string
          voting_power: number
        }
        Insert: {
          id?: string
          proposal_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voted_at?: string
          voting_power?: number
        }
        Update: {
          id?: string
          proposal_id?: string
          user_id?: string
          vote?: Database["public"]["Enums"]["vote_choice"]
          voted_at?: string
          voting_power?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "governance_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_tracking: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_address: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_address: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          user_id: string
          uses_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id: string
          uses_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id?: string
          uses_count?: number | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          onboarding_completed: boolean | null
          referral_code_id: string | null
          referred_id: string
          referrer_id: string
          reward_amount: number | null
          reward_distributed: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          onboarding_completed?: boolean | null
          referral_code_id?: string | null
          referred_id: string
          referrer_id: string
          reward_amount?: number | null
          reward_distributed?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          onboarding_completed?: boolean | null
          referral_code_id?: string | null
          referred_id?: string
          referrer_id?: string
          reward_amount?: number | null
          reward_distributed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_configurations: {
        Row: {
          description: string | null
          id: string
          is_active: boolean | null
          max_per_user_daily: number | null
          mxg_amount: number
          reward_type: string
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_per_user_daily?: number | null
          mxg_amount: number
          reward_type: string
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_per_user_daily?: number | null
          mxg_amount?: number
          reward_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rss_feed_sources: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          url?: string
        }
        Relationships: []
      }
      staking_pools: {
        Row: {
          apy_percentage: number
          created_at: string
          id: string
          is_active: boolean
          lock_period_days: number
          min_stake_amount: number
          pool_name: string
          token_definition_id: string
          total_staked: number
        }
        Insert: {
          apy_percentage?: number
          created_at?: string
          id?: string
          is_active?: boolean
          lock_period_days?: number
          min_stake_amount?: number
          pool_name: string
          token_definition_id: string
          total_staked?: number
        }
        Update: {
          apy_percentage?: number
          created_at?: string
          id?: string
          is_active?: boolean
          lock_period_days?: number
          min_stake_amount?: number
          pool_name?: string
          token_definition_id?: string
          total_staked?: number
        }
        Relationships: [
          {
            foreignKeyName: "staking_pools_token_definition_id_fkey"
            columns: ["token_definition_id"]
            isOneToOne: false
            referencedRelation: "token_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          arb_execution_locked: boolean
          arb_execution_locked_at: string | null
          arb_execution_locked_reason: string | null
          auto_arbitrage_enabled: boolean
          auto_flash_loans_enabled: boolean
          evm_fee_payer_top_up_native: number
          evm_min_fee_payer_balance_native: number
          flash_loan_cooldown_seconds: number | null
          flash_loan_profit_threshold_bps: number | null
          id: string
          is_mainnet_mode: boolean
          last_safety_check_at: string | null
          launch_stage: string | null
          mainnet_fee_payer_top_up_sol: number
          mainnet_min_fee_payer_balance_sol: number
          mainnet_min_profit_to_gas_ratio: number
          max_flash_loan_amount_native: number | null
          max_global_daily_loss_native: number
          max_global_trades_per_day: number
          rpc_arbitrum_url: string | null
          rpc_bsc_url: string | null
          rpc_ethereum_url: string | null
          rpc_polygon_url: string | null
          rpc_solana_devnet_url: string | null
          rpc_solana_mainnet_url: string | null
          safe_mode_enabled: boolean
          safe_mode_reason: string | null
          safe_mode_triggered_at: string | null
          stripe_test_mode: boolean
          stripe_test_mode_toggled_at: string | null
          stripe_test_mode_toggled_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          arb_execution_locked?: boolean
          arb_execution_locked_at?: string | null
          arb_execution_locked_reason?: string | null
          auto_arbitrage_enabled?: boolean
          auto_flash_loans_enabled?: boolean
          evm_fee_payer_top_up_native?: number
          evm_min_fee_payer_balance_native?: number
          flash_loan_cooldown_seconds?: number | null
          flash_loan_profit_threshold_bps?: number | null
          id?: string
          is_mainnet_mode?: boolean
          last_safety_check_at?: string | null
          launch_stage?: string | null
          mainnet_fee_payer_top_up_sol?: number
          mainnet_min_fee_payer_balance_sol?: number
          mainnet_min_profit_to_gas_ratio?: number
          max_flash_loan_amount_native?: number | null
          max_global_daily_loss_native?: number
          max_global_trades_per_day?: number
          rpc_arbitrum_url?: string | null
          rpc_bsc_url?: string | null
          rpc_ethereum_url?: string | null
          rpc_polygon_url?: string | null
          rpc_solana_devnet_url?: string | null
          rpc_solana_mainnet_url?: string | null
          safe_mode_enabled?: boolean
          safe_mode_reason?: string | null
          safe_mode_triggered_at?: string | null
          stripe_test_mode?: boolean
          stripe_test_mode_toggled_at?: string | null
          stripe_test_mode_toggled_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          arb_execution_locked?: boolean
          arb_execution_locked_at?: string | null
          arb_execution_locked_reason?: string | null
          auto_arbitrage_enabled?: boolean
          auto_flash_loans_enabled?: boolean
          evm_fee_payer_top_up_native?: number
          evm_min_fee_payer_balance_native?: number
          flash_loan_cooldown_seconds?: number | null
          flash_loan_profit_threshold_bps?: number | null
          id?: string
          is_mainnet_mode?: boolean
          last_safety_check_at?: string | null
          launch_stage?: string | null
          mainnet_fee_payer_top_up_sol?: number
          mainnet_min_fee_payer_balance_sol?: number
          mainnet_min_profit_to_gas_ratio?: number
          max_flash_loan_amount_native?: number | null
          max_global_daily_loss_native?: number
          max_global_trades_per_day?: number
          rpc_arbitrum_url?: string | null
          rpc_bsc_url?: string | null
          rpc_ethereum_url?: string | null
          rpc_polygon_url?: string | null
          rpc_solana_devnet_url?: string | null
          rpc_solana_mainnet_url?: string | null
          safe_mode_enabled?: boolean
          safe_mode_reason?: string | null
          safe_mode_triggered_at?: string | null
          stripe_test_mode?: boolean
          stripe_test_mode_toggled_at?: string | null
          stripe_test_mode_toggled_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      token_definition_proposals: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          asset_id: string
          created_at: string
          decimals: number
          deployment_profile: string | null
          id: string
          notes: string | null
          proposed_by: string
          status: string
          token_model: Database["public"]["Enums"]["token_model"]
          token_name: string
          token_symbol: string
          total_supply: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_id: string
          created_at?: string
          decimals?: number
          deployment_profile?: string | null
          id?: string
          notes?: string | null
          proposed_by: string
          status?: string
          token_model?: Database["public"]["Enums"]["token_model"]
          token_name: string
          token_symbol: string
          total_supply?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string
          created_at?: string
          decimals?: number
          deployment_profile?: string | null
          id?: string
          notes?: string | null
          proposed_by?: string
          status?: string
          token_model?: Database["public"]["Enums"]["token_model"]
          token_name?: string
          token_symbol?: string
          total_supply?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_definition_proposals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      token_definitions: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          asset_id: string
          chain: Database["public"]["Enums"]["blockchain_chain"]
          contract_address: string | null
          created_at: string
          decimals: number
          deployment_profile: string | null
          deployment_status: Database["public"]["Enums"]["deployment_status"]
          id: string
          network: Database["public"]["Enums"]["network_type"]
          notes: string | null
          token_image_url: string | null
          token_model: Database["public"]["Enums"]["token_model"]
          token_name: string
          token_symbol: string
          total_supply: number
          treasury_account: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          asset_id: string
          chain?: Database["public"]["Enums"]["blockchain_chain"]
          contract_address?: string | null
          created_at?: string
          decimals?: number
          deployment_profile?: string | null
          deployment_status?: Database["public"]["Enums"]["deployment_status"]
          id?: string
          network?: Database["public"]["Enums"]["network_type"]
          notes?: string | null
          token_image_url?: string | null
          token_model: Database["public"]["Enums"]["token_model"]
          token_name: string
          token_symbol: string
          total_supply?: number
          treasury_account?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          asset_id?: string
          chain?: Database["public"]["Enums"]["blockchain_chain"]
          contract_address?: string | null
          created_at?: string
          decimals?: number
          deployment_profile?: string | null
          deployment_status?: Database["public"]["Enums"]["deployment_status"]
          id?: string
          network?: Database["public"]["Enums"]["network_type"]
          notes?: string | null
          token_image_url?: string | null
          token_model?: Database["public"]["Enums"]["token_model"]
          token_name?: string
          token_symbol?: string
          total_supply?: number
          treasury_account?: string | null
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
      training_courses: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          difficulty_level: string | null
          estimated_duration_minutes: number | null
          id: string
          is_public: boolean
          is_published: boolean
          mxg_reward_amount: number
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_public?: boolean
          is_published?: boolean
          mxg_reward_amount?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_public?: boolean
          is_published?: boolean
          mxg_reward_amount?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_lessons: {
        Row: {
          content_text: string | null
          content_type: string
          content_url: string | null
          course_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_text?: string | null
          content_type: string
          content_url?: string | null
          course_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_text?: string | null
          content_type?: string
          content_url?: string | null
          course_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_requests: {
        Row: {
          amount: number
          created_at: string
          from_user_id: string
          id: string
          message: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["transfer_request_status"]
          to_user_id: string
          token_definition_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_user_id: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["transfer_request_status"]
          to_user_id: string
          token_definition_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["transfer_request_status"]
          to_user_id?: string
          token_definition_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_requests_token_definition_id_fkey"
            columns: ["token_definition_id"]
            isOneToOne: false
            referencedRelation: "token_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_accounts: {
        Row: {
          annual_renewal_date: string | null
          created_at: string
          ein_last_four: string | null
          entity_type: string
          formation_date: string | null
          formation_state: string | null
          id: string
          is_active: boolean
          legal_name: string
          notes: string | null
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          annual_renewal_date?: string | null
          created_at?: string
          ein_last_four?: string | null
          entity_type: string
          formation_date?: string | null
          formation_state?: string | null
          id?: string
          is_active?: boolean
          legal_name: string
          notes?: string | null
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          annual_renewal_date?: string | null
          created_at?: string
          ein_last_four?: string | null
          entity_type?: string
          formation_date?: string | null
          formation_state?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string
          notes?: string | null
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trust_invoices: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          due_date: string
          id: string
          invoice_number: string
          paid_at: string | null
          status: string
          stripe_invoice_id: string | null
          trust_account_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description: string
          due_date: string
          id?: string
          invoice_number: string
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          trust_account_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          invoice_number?: string
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          trust_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_invoices_trust_account_id_fkey"
            columns: ["trust_account_id"]
            isOneToOne: false
            referencedRelation: "trust_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_asset_submissions: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          asset_type: string
          created_asset_id: string | null
          created_at: string
          description: string | null
          documents: Json | null
          estimated_quantity: number | null
          id: string
          location_description: string | null
          payment_status: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_by_role: string
          title: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_type: string
          created_asset_id?: string | null
          created_at?: string
          description?: string | null
          documents?: Json | null
          estimated_quantity?: number | null
          id?: string
          location_description?: string | null
          payment_status?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_by_role: string
          title: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_type?: string
          created_asset_id?: string | null
          created_at?: string
          description?: string | null
          documents?: Json | null
          estimated_quantity?: number | null
          id?: string
          location_description?: string | null
          payment_status?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_by_role?: string
          title?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_asset_submissions_created_asset_id_fkey"
            columns: ["created_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_course_progress: {
        Row: {
          completed_at: string | null
          course_id: string
          id: string
          reward_claimed: boolean
          reward_claimed_at: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          id?: string
          reward_claimed?: boolean
          reward_claimed_at?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          id?: string
          reward_claimed?: boolean
          reward_claimed_at?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_course_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lesson_progress: {
        Row: {
          completed_at: string | null
          id: string
          last_position_seconds: number | null
          lesson_id: string
          started_at: string
          time_spent_seconds: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          last_position_seconds?: number | null
          lesson_id: string
          started_at?: string
          time_spent_seconds?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          last_position_seconds?: number | null
          lesson_id?: string
          started_at?: string
          time_spent_seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
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
      user_stakes: {
        Row: {
          id: string
          is_active: boolean
          last_reward_calculation: string
          rewards_earned: number
          staked_amount: number
          staked_at: string
          staking_pool_id: string
          unlock_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          last_reward_calculation?: string
          rewards_earned?: number
          staked_amount?: number
          staked_at?: string
          staking_pool_id: string
          unlock_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          last_reward_calculation?: string
          rewards_earned?: number
          staked_amount?: number
          staked_at?: string
          staking_pool_id?: string
          unlock_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stakes_staking_pool_id_fkey"
            columns: ["staking_pool_id"]
            isOneToOne: false
            referencedRelation: "staking_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_token_holdings: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          balance: number
          delivery_wallet_address: string | null
          delivery_wallet_type: string | null
          id: string
          token_definition_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          balance?: number
          delivery_wallet_address?: string | null
          delivery_wallet_type?: string | null
          id?: string
          token_definition_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          balance?: number
          delivery_wallet_address?: string | null
          delivery_wallet_type?: string | null
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
      wallet_balance_snapshots: {
        Row: {
          balance_native: number
          captured_at: string
          chain: string
          id: string
          wallet_address: string
          wallet_type: string
        }
        Insert: {
          balance_native: number
          captured_at?: string
          chain: string
          id?: string
          wallet_address: string
          wallet_type: string
        }
        Update: {
          balance_native?: number
          captured_at?: string
          chain?: string
          id?: string
          wallet_address?: string
          wallet_type?: string
        }
        Relationships: []
      }
      wallet_refill_requests: {
        Row: {
          chain: string
          created_at: string
          error_message: string | null
          fulfilled_at: string | null
          fulfilled_by_run_id: string | null
          id: string
          reason: string
          required_amount_native: number
          status: string
          updated_at: string
          wallet_address: string
          wallet_type: string
        }
        Insert: {
          chain: string
          created_at?: string
          error_message?: string | null
          fulfilled_at?: string | null
          fulfilled_by_run_id?: string | null
          id?: string
          reason: string
          required_amount_native?: number
          status?: string
          updated_at?: string
          wallet_address: string
          wallet_type: string
        }
        Update: {
          chain?: string
          created_at?: string
          error_message?: string | null
          fulfilled_at?: string | null
          fulfilled_by_run_id?: string | null
          id?: string
          reason?: string
          required_amount_native?: number
          status?: string
          updated_at?: string
          wallet_address?: string
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_refill_requests_fulfilled_by_run_id_fkey"
            columns: ["fulfilled_by_run_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      get_system_settings: {
        Args: never
        Returns: {
          arb_execution_locked: boolean
          arb_execution_locked_at: string | null
          arb_execution_locked_reason: string | null
          auto_arbitrage_enabled: boolean
          auto_flash_loans_enabled: boolean
          evm_fee_payer_top_up_native: number
          evm_min_fee_payer_balance_native: number
          flash_loan_cooldown_seconds: number | null
          flash_loan_profit_threshold_bps: number | null
          id: string
          is_mainnet_mode: boolean
          last_safety_check_at: string | null
          launch_stage: string | null
          mainnet_fee_payer_top_up_sol: number
          mainnet_min_fee_payer_balance_sol: number
          mainnet_min_profit_to_gas_ratio: number
          max_flash_loan_amount_native: number | null
          max_global_daily_loss_native: number
          max_global_trades_per_day: number
          rpc_arbitrum_url: string | null
          rpc_bsc_url: string | null
          rpc_ethereum_url: string | null
          rpc_polygon_url: string | null
          rpc_solana_devnet_url: string | null
          rpc_solana_mainnet_url: string | null
          safe_mode_enabled: boolean
          safe_mode_reason: string | null
          safe_mode_triggered_at: string | null
          stripe_test_mode: boolean
          stripe_test_mode_toggled_at: string | null
          stripe_test_mode_toggled_by: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "system_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "standard_user" | "asset_manager"
      arbitrage_run_status: "SIMULATED" | "EXECUTED" | "FAILED"
      asset_type:
        | "GOLDBACK"
        | "SILVER"
        | "COPPER"
        | "GOLD_CERTIFICATE"
        | "SILVER_CERTIFICATE"
        | "OTHER"
      attestation_status: "PENDING" | "ATTESTED" | "REJECTED"
      blockchain_chain: "ETHEREUM" | "POLYGON" | "BSC" | "SOLANA" | "NONE"
      deployment_status: "NOT_DEPLOYED" | "PENDING" | "DEPLOYED"
      network_type: "MAINNET" | "TESTNET" | "NONE"
      order_status: "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED"
      order_type: "BUY" | "SELL"
      owner_entity: "PERSONAL_TRUST" | "BUSINESS_TRUST" | "SPV_LLC"
      proposal_status:
        | "DRAFT"
        | "ACTIVE"
        | "PASSED"
        | "REJECTED"
        | "EXECUTED"
        | "CANCELLED"
      proposal_type:
        | "PARAMETER_CHANGE"
        | "TOKEN_ADDITION"
        | "FEE_ADJUSTMENT"
        | "GENERAL"
      submission_status: "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED"
      token_model: "ONE_TO_ONE" | "FRACTIONAL" | "VAULT_BASKET"
      transfer_request_status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
      vote_choice: "FOR" | "AGAINST" | "ABSTAIN"
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
      app_role: ["admin", "standard_user", "asset_manager"],
      arbitrage_run_status: ["SIMULATED", "EXECUTED", "FAILED"],
      asset_type: [
        "GOLDBACK",
        "SILVER",
        "COPPER",
        "GOLD_CERTIFICATE",
        "SILVER_CERTIFICATE",
        "OTHER",
      ],
      attestation_status: ["PENDING", "ATTESTED", "REJECTED"],
      blockchain_chain: ["ETHEREUM", "POLYGON", "BSC", "SOLANA", "NONE"],
      deployment_status: ["NOT_DEPLOYED", "PENDING", "DEPLOYED"],
      network_type: ["MAINNET", "TESTNET", "NONE"],
      order_status: ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED"],
      order_type: ["BUY", "SELL"],
      owner_entity: ["PERSONAL_TRUST", "BUSINESS_TRUST", "SPV_LLC"],
      proposal_status: [
        "DRAFT",
        "ACTIVE",
        "PASSED",
        "REJECTED",
        "EXECUTED",
        "CANCELLED",
      ],
      proposal_type: [
        "PARAMETER_CHANGE",
        "TOKEN_ADDITION",
        "FEE_ADJUSTMENT",
        "GENERAL",
      ],
      submission_status: ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"],
      token_model: ["ONE_TO_ONE", "FRACTIONAL", "VAULT_BASKET"],
      transfer_request_status: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      vote_choice: ["FOR", "AGAINST", "ABSTAIN"],
    },
  },
} as const
