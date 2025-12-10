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
      arbitrage_runs: {
        Row: {
          actual_profit_lamports: number | null
          created_at: string
          error_message: string | null
          estimated_profit_lamports: number | null
          finished_at: string | null
          id: string
          started_at: string
          status: Database["public"]["Enums"]["arbitrage_run_status"]
          strategy_id: string
          tx_signature: string | null
          updated_at: string
        }
        Insert: {
          actual_profit_lamports?: number | null
          created_at?: string
          error_message?: string | null
          estimated_profit_lamports?: number | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status: Database["public"]["Enums"]["arbitrage_run_status"]
          strategy_id: string
          tx_signature?: string | null
          updated_at?: string
        }
        Update: {
          actual_profit_lamports?: number | null
          created_at?: string
          error_message?: string | null
          estimated_profit_lamports?: number | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["arbitrage_run_status"]
          strategy_id?: string
          tx_signature?: string | null
          updated_at?: string
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
        }
        Insert: {
          chain_type?: string
          created_at?: string
          dex_a: string
          dex_b: string
          evm_network?: string | null
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
        }
        Update: {
          chain_type?: string
          created_at?: string
          dex_a?: string
          dex_b?: string
          evm_network?: string | null
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
      token_definitions: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          asset_id: string
          chain: Database["public"]["Enums"]["blockchain_chain"]
          contract_address: string | null
          created_at: string
          decimals: number
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
