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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          conversation_history_limit: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_tokens: number
          model: string
          name: string
          rag_config: Json
          suggested_questions: Json
          system_prompt: string | null
          temperature: number
          updated_at: string
          user_id: string
          widget_config: Json
        }
        Insert: {
          conversation_history_limit?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_tokens?: number
          model?: string
          name: string
          rag_config?: Json
          suggested_questions?: Json
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
          user_id: string
          widget_config?: Json
        }
        Update: {
          conversation_history_limit?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_tokens?: number
          model?: string
          name?: string
          rag_config?: Json
          suggested_questions?: Json
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
          user_id?: string
          widget_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_configs: {
        Row: {
          bot_id: string
          channel: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          bot_id: string
          channel: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          bot_id?: string
          channel?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_configs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          bot_id: string
          channel: string
          created_at: string
          id: string
          language: string
          metadata: Json
          session_id: string | null
          updated_at: string
        }
        Insert: {
          bot_id: string
          channel?: string
          created_at?: string
          id?: string
          language?: string
          metadata?: Json
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          bot_id?: string
          channel?: string
          created_at?: string
          id?: string
          language?: string
          metadata?: Json
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_models: {
        Row: {
          api_key_env: string
          api_key_header: string
          base_url: string
          created_at: string
          id: string
          is_active: boolean
          model_id: string
          name: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key_env?: string
          api_key_header?: string
          base_url: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_id: string
          name: string
          provider?: string
          updated_at?: string
        }
        Update: {
          api_key_env?: string
          api_key_header?: string
          base_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_id?: string
          name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          bot_id: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json
        }
        Insert: {
          bot_id: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          bot_id?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          bot_id: string
          chunk_count: number
          created_at: string
          doc_type: string | null
          error_message: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          language: string | null
          source_url: string | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          bot_id: string
          chunk_count?: number
          created_at?: string
          doc_type?: string | null
          error_message?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          language?: string | null
          source_url?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          bot_id?: string
          chunk_count?: number
          created_at?: string
          doc_type?: string | null
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          language?: string | null
          source_url?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string
          rating: number | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
          rating?: number | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_url: string | null
          paddle_transaction_id: string | null
          period_end: string | null
          period_start: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          paddle_transaction_id?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          paddle_transaction_id?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kakao_user_mappings: {
        Row: {
          bot_id: string
          conversation_id: string
          created_at: string
          id: string
          kakao_user_id: string
          language: string
          updated_at: string
        }
        Insert: {
          bot_id: string
          conversation_id: string
          created_at?: string
          id?: string
          kakao_user_id: string
          language?: string
          updated_at?: string
        }
        Update: {
          bot_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kakao_user_id?: string
          language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakao_user_mappings_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_user_mappings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_attachment: {
        Row: {
          created_at: string
          description: string | null
          entity_id: number
          entity_table: string
          file_path: string
          file_type: string
          id: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id: number
          entity_table: string
          file_path: string
          file_type: string
          id?: never
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: number
          entity_table?: string
          file_path?: string
          file_type?: string
          id?: never
        }
        Relationships: []
      }
      kbsi_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: number
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id: number
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: number
          table_name?: string
        }
        Relationships: []
      }
      kbsi_characterization: {
        Row: {
          attempt_number: number | null
          construct_id: number
          created_at: string
          id: number
          is_validated: boolean
          method: string
          notes: string | null
          performed_by: string | null
          performed_on: string | null
          reference_id: number | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          unit_normalized: string | null
          unit_raw: string | null
          updated_at: string
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          attempt_number?: number | null
          construct_id: number
          created_at?: string
          id?: never
          is_validated?: boolean
          method: string
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          unit_normalized?: string | null
          unit_raw?: string | null
          updated_at?: string
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          attempt_number?: number | null
          construct_id?: number
          created_at?: string
          id?: never
          is_validated?: boolean
          method?: string
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          unit_normalized?: string | null
          unit_raw?: string | null
          updated_at?: string
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_characterization_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_characterization_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_construct: {
        Row: {
          cleavage_site: string | null
          codon_optimized: boolean | null
          construct_type:
            | Database["public"]["Enums"]["kbsi_construct_type"]
            | null
          created_at: string
          dna_sequence: string | null
          expression_system: string | null
          id: number
          name: string | null
          parent_construct_id: number | null
          protein_id: number
          residues: string | null
          seq_expression: string | null
          seq_final: string | null
          seq_hash: string | null
          status: string | null
          tag_name: string | null
          tag_position: Database["public"]["Enums"]["kbsi_tag_position"] | null
          theoretical_mw: number | null
          theoretical_pi: number | null
          updated_at: string
          vector: string | null
        }
        Insert: {
          cleavage_site?: string | null
          codon_optimized?: boolean | null
          construct_type?:
            | Database["public"]["Enums"]["kbsi_construct_type"]
            | null
          created_at?: string
          dna_sequence?: string | null
          expression_system?: string | null
          id?: never
          name?: string | null
          parent_construct_id?: number | null
          protein_id: number
          residues?: string | null
          seq_expression?: string | null
          seq_final?: string | null
          seq_hash?: string | null
          status?: string | null
          tag_name?: string | null
          tag_position?: Database["public"]["Enums"]["kbsi_tag_position"] | null
          theoretical_mw?: number | null
          theoretical_pi?: number | null
          updated_at?: string
          vector?: string | null
        }
        Update: {
          cleavage_site?: string | null
          codon_optimized?: boolean | null
          construct_type?:
            | Database["public"]["Enums"]["kbsi_construct_type"]
            | null
          created_at?: string
          dna_sequence?: string | null
          expression_system?: string | null
          id?: never
          name?: string | null
          parent_construct_id?: number | null
          protein_id?: number
          residues?: string | null
          seq_expression?: string | null
          seq_final?: string | null
          seq_hash?: string | null
          status?: string | null
          tag_name?: string | null
          tag_position?: Database["public"]["Enums"]["kbsi_tag_position"] | null
          theoretical_mw?: number | null
          theoretical_pi?: number | null
          updated_at?: string
          vector?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_construct_parent_construct_id_fkey"
            columns: ["parent_construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_construct_protein_id_fkey"
            columns: ["protein_id"]
            isOneToOne: false
            referencedRelation: "kbsi_protein"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_construct_ligand: {
        Row: {
          binding_ic50: number | null
          binding_kd: number | null
          construct_id: number
          id: number
          ligand_id: number
          notes: string | null
        }
        Insert: {
          binding_ic50?: number | null
          binding_kd?: number | null
          construct_id: number
          id?: never
          ligand_id: number
          notes?: string | null
        }
        Update: {
          binding_ic50?: number | null
          binding_kd?: number | null
          construct_id?: number
          id?: never
          ligand_id?: number
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_construct_ligand_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_construct_ligand_ligand_id_fkey"
            columns: ["ligand_id"]
            isOneToOne: false
            referencedRelation: "kbsi_ligand"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_cryoem_session: {
        Row: {
          attempt_number: number | null
          construct_id: number
          created_at: string
          detector: string | null
          id: number
          is_validated: boolean
          microscope: string | null
          notes: string | null
          num_particles: number | null
          performed_by: string | null
          performed_on: string | null
          pixel_size: number | null
          processing_detail: string | null
          reference_id: number | null
          refinement_software: string | null
          resolution: number | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at: string
          voltage_kv: number | null
        }
        Insert: {
          attempt_number?: number | null
          construct_id: number
          created_at?: string
          detector?: string | null
          id?: never
          is_validated?: boolean
          microscope?: string | null
          notes?: string | null
          num_particles?: number | null
          performed_by?: string | null
          performed_on?: string | null
          pixel_size?: number | null
          processing_detail?: string | null
          reference_id?: number | null
          refinement_software?: string | null
          resolution?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at?: string
          voltage_kv?: number | null
        }
        Update: {
          attempt_number?: number | null
          construct_id?: number
          created_at?: string
          detector?: string | null
          id?: never
          is_validated?: boolean
          microscope?: string | null
          notes?: string | null
          num_particles?: number | null
          performed_by?: string | null
          performed_on?: string | null
          pixel_size?: number | null
          processing_detail?: string | null
          reference_id?: number | null
          refinement_software?: string | null
          resolution?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at?: string
          voltage_kv?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_cryoem_session_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_cryoem_session_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_crystallization: {
        Row: {
          additive: string | null
          attempt_number: number | null
          buffer_type: string | null
          condition_detail: string | null
          construct_id: number
          created_at: string
          days_to_crystal: number | null
          drop_ratio: string | null
          id: number
          is_validated: boolean
          notes: string | null
          outcome:
            | Database["public"]["Enums"]["kbsi_crystallization_outcome"]
            | null
          performed_by: string | null
          performed_on: string | null
          ph: number | null
          precipitant_conc: number | null
          precipitant_type: string | null
          precipitant_unit: string | null
          protein_concentration: number | null
          reference_id: number | null
          salt_conc: number | null
          salt_type: string | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          stage:
            | Database["public"]["Enums"]["kbsi_crystallization_stage"]
            | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          additive?: string | null
          attempt_number?: number | null
          buffer_type?: string | null
          condition_detail?: string | null
          construct_id: number
          created_at?: string
          days_to_crystal?: number | null
          drop_ratio?: string | null
          id?: never
          is_validated?: boolean
          notes?: string | null
          outcome?:
            | Database["public"]["Enums"]["kbsi_crystallization_outcome"]
            | null
          performed_by?: string | null
          performed_on?: string | null
          ph?: number | null
          precipitant_conc?: number | null
          precipitant_type?: string | null
          precipitant_unit?: string | null
          protein_concentration?: number | null
          reference_id?: number | null
          salt_conc?: number | null
          salt_type?: string | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          stage?:
            | Database["public"]["Enums"]["kbsi_crystallization_stage"]
            | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          additive?: string | null
          attempt_number?: number | null
          buffer_type?: string | null
          condition_detail?: string | null
          construct_id?: number
          created_at?: string
          days_to_crystal?: number | null
          drop_ratio?: string | null
          id?: never
          is_validated?: boolean
          notes?: string | null
          outcome?:
            | Database["public"]["Enums"]["kbsi_crystallization_outcome"]
            | null
          performed_by?: string | null
          performed_on?: string | null
          ph?: number | null
          precipitant_conc?: number | null
          precipitant_type?: string | null
          precipitant_unit?: string | null
          protein_concentration?: number | null
          reference_id?: number | null
          salt_conc?: number | null
          salt_type?: string | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          stage?:
            | Database["public"]["Enums"]["kbsi_crystallization_stage"]
            | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_crystallization_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_crystallization_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_database_id: {
        Row: {
          db_name: string
          db_value: string
          id: number
          protein_id: number
        }
        Insert: {
          db_name: string
          db_value: string
          id?: never
          protein_id: number
        }
        Update: {
          db_name?: string
          db_value?: string
          id?: never
          protein_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_database_id_protein_id_fkey"
            columns: ["protein_id"]
            isOneToOne: false
            referencedRelation: "kbsi_protein"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_diffraction: {
        Row: {
          attempt_number: number | null
          beamline: string | null
          construct_id: number
          created_at: string
          crystal_id: string | null
          data_quality: string | null
          id: number
          is_validated: boolean
          notes: string | null
          performed_by: string | null
          performed_on: string | null
          phasing: string | null
          reference_id: number | null
          resolution: number | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          space_group: string | null
          unit_cell: string | null
          updated_at: string
        }
        Insert: {
          attempt_number?: number | null
          beamline?: string | null
          construct_id: number
          created_at?: string
          crystal_id?: string | null
          data_quality?: string | null
          id?: never
          is_validated?: boolean
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          phasing?: string | null
          reference_id?: number | null
          resolution?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          space_group?: string | null
          unit_cell?: string | null
          updated_at?: string
        }
        Update: {
          attempt_number?: number | null
          beamline?: string | null
          construct_id?: number
          created_at?: string
          crystal_id?: string | null
          data_quality?: string | null
          id?: never
          is_validated?: boolean
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          phasing?: string | null
          reference_id?: number | null
          resolution?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          space_group?: string | null
          unit_cell?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_diffraction_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_diffraction_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_expression: {
        Row: {
          attempt_number: number | null
          conditions: string | null
          construct_id: number
          created_at: string
          host: string | null
          id: number
          induction_temp: number | null
          is_validated: boolean
          notes: string | null
          performed_by: string | null
          performed_on: string | null
          reference_id: number | null
          result_level:
            | Database["public"]["Enums"]["kbsi_expression_result"]
            | null
          solubility: string | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          strain: string | null
          updated_at: string
          yield_mg_l: number | null
        }
        Insert: {
          attempt_number?: number | null
          conditions?: string | null
          construct_id: number
          created_at?: string
          host?: string | null
          id?: never
          induction_temp?: number | null
          is_validated?: boolean
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          result_level?:
            | Database["public"]["Enums"]["kbsi_expression_result"]
            | null
          solubility?: string | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          strain?: string | null
          updated_at?: string
          yield_mg_l?: number | null
        }
        Update: {
          attempt_number?: number | null
          conditions?: string | null
          construct_id?: number
          created_at?: string
          host?: string | null
          id?: never
          induction_temp?: number | null
          is_validated?: boolean
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          result_level?:
            | Database["public"]["Enums"]["kbsi_expression_result"]
            | null
          solubility?: string | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          strain?: string | null
          updated_at?: string
          yield_mg_l?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_expression_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_expression_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_extraction_staging: {
        Row: {
          extracted_by: string | null
          extracted_payload: Json
          extraction_confidence: number | null
          extraction_date: string
          id: number
          model_version: string | null
          reference_id: number | null
          review_notes: string | null
          review_status: Database["public"]["Enums"]["kbsi_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          source_location: string | null
          source_snippet: string | null
          target_table: string
        }
        Insert: {
          extracted_by?: string | null
          extracted_payload: Json
          extraction_confidence?: number | null
          extraction_date?: string
          id?: never
          model_version?: string | null
          reference_id?: number | null
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["kbsi_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_location?: string | null
          source_snippet?: string | null
          target_table: string
        }
        Update: {
          extracted_by?: string | null
          extracted_payload?: Json
          extraction_confidence?: number | null
          extraction_date?: string
          id?: never
          model_version?: string | null
          reference_id?: number | null
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["kbsi_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_location?: string | null
          source_snippet?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_extraction_staging_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_ligand: {
        Row: {
          created_at: string
          id: number
          inchi: string | null
          mw: number | null
          name: string
          smiles: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          inchi?: string | null
          mw?: number | null
          name: string
          smiles?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          inchi?: string | null
          mw?: number | null
          name?: string
          smiles?: string | null
          source?: string | null
        }
        Relationships: []
      }
      kbsi_mutation: {
        Row: {
          construct_id: number
          id: number
          mutation: string
        }
        Insert: {
          construct_id: number
          id?: never
          mutation: string
        }
        Update: {
          construct_id?: number
          id?: never
          mutation?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_mutation_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_nmr_experiment: {
        Row: {
          attempt_number: number | null
          bmrb_id: string | null
          construct_id: number
          created_at: string
          id: number
          is_validated: boolean
          labelling: string | null
          magnetic_field: number | null
          notes: string | null
          performed_by: string | null
          performed_on: string | null
          reference_id: number | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          spectrometer: string | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          attempt_number?: number | null
          bmrb_id?: string | null
          construct_id: number
          created_at?: string
          id?: never
          is_validated?: boolean
          labelling?: string | null
          magnetic_field?: number | null
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          spectrometer?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          attempt_number?: number | null
          bmrb_id?: string | null
          construct_id?: number
          created_at?: string
          id?: never
          is_validated?: boolean
          labelling?: string | null
          magnetic_field?: number | null
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          spectrometer?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_nmr_experiment_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_nmr_experiment_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_nmr_spectrum: {
        Row: {
          id: number
          nmr_experiment_id: number
          spectrum_type: string
        }
        Insert: {
          id?: never
          nmr_experiment_id: number
          spectrum_type: string
        }
        Update: {
          id?: never
          nmr_experiment_id?: number
          spectrum_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_nmr_spectrum_nmr_experiment_id_fkey"
            columns: ["nmr_experiment_id"]
            isOneToOne: false
            referencedRelation: "kbsi_nmr_experiment"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_protein: {
        Row: {
          abbreviation: string | null
          created_at: string
          custom_id: string | null
          full_name: string
          gene_name: string | null
          id: number
          organism: string | null
          owner: string | null
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string
          custom_id?: string | null
          full_name: string
          gene_name?: string | null
          id?: never
          organism?: string | null
          owner?: string | null
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          created_at?: string
          custom_id?: string | null
          full_name?: string
          gene_name?: string | null
          id?: never
          organism?: string | null
          owner?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kbsi_purification: {
        Row: {
          attempt_number: number | null
          construct_id: number
          created_at: string
          final_purity: number | null
          final_yield: number | null
          id: number
          is_validated: boolean
          method_summary: string | null
          notes: string | null
          performed_by: string | null
          performed_on: string | null
          reference_id: number | null
          result_level:
            | Database["public"]["Enums"]["kbsi_purification_result"]
            | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at: string
        }
        Insert: {
          attempt_number?: number | null
          construct_id: number
          created_at?: string
          final_purity?: number | null
          final_yield?: number | null
          id?: never
          is_validated?: boolean
          method_summary?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          result_level?:
            | Database["public"]["Enums"]["kbsi_purification_result"]
            | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at?: string
        }
        Update: {
          attempt_number?: number | null
          construct_id?: number
          created_at?: string
          final_purity?: number | null
          final_yield?: number | null
          id?: never
          is_validated?: boolean
          method_summary?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          reference_id?: number | null
          result_level?:
            | Database["public"]["Enums"]["kbsi_purification_result"]
            | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_purification_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_purification_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_purification_step: {
        Row: {
          buffer: string | null
          column_resin: string | null
          id: number
          purification_id: number
          result_yield: string | null
          step_number: number
          treatment: string | null
        }
        Insert: {
          buffer?: string | null
          column_resin?: string | null
          id?: never
          purification_id: number
          result_yield?: string | null
          step_number: number
          treatment?: string | null
        }
        Update: {
          buffer?: string | null
          column_resin?: string | null
          id?: never
          purification_id?: number
          result_yield?: string | null
          step_number?: number
          treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_purification_step_purification_id_fkey"
            columns: ["purification_id"]
            isOneToOne: false
            referencedRelation: "kbsi_purification"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_reference: {
        Row: {
          authors: string | null
          doi: string | null
          id: number
          journal: string | null
          pmid: string | null
          title: string | null
          year: number | null
        }
        Insert: {
          authors?: string | null
          doi?: string | null
          id?: never
          journal?: string | null
          pmid?: string | null
          title?: string | null
          year?: number | null
        }
        Update: {
          authors?: string | null
          doi?: string | null
          id?: never
          journal?: string | null
          pmid?: string | null
          title?: string | null
          year?: number | null
        }
        Relationships: []
      }
      kbsi_storage: {
        Row: {
          attempt_number: number | null
          concentration: number | null
          construct_id: number
          created_at: string
          id: number
          is_validated: boolean
          location: string | null
          notes: string | null
          performed_by: string | null
          performed_on: string | null
          purified_on: string | null
          reference_id: number | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          storage_buffer: string | null
          updated_at: string
          volume: number | null
        }
        Insert: {
          attempt_number?: number | null
          concentration?: number | null
          construct_id: number
          created_at?: string
          id?: never
          is_validated?: boolean
          location?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          purified_on?: string | null
          reference_id?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          storage_buffer?: string | null
          updated_at?: string
          volume?: number | null
        }
        Update: {
          attempt_number?: number | null
          concentration?: number | null
          construct_id?: number
          created_at?: string
          id?: never
          is_validated?: boolean
          location?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_on?: string | null
          purified_on?: string | null
          reference_id?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          storage_buffer?: string | null
          updated_at?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_storage_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_storage_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      kbsi_structure: {
        Row: {
          attempt_number: number | null
          bmrb_id: string | null
          construct_id: number
          created_at: string
          emdb_id: string | null
          id: number
          is_validated: boolean
          method: Database["public"]["Enums"]["kbsi_structure_method"]
          notes: string | null
          pdb_id: string | null
          performed_by: string | null
          performed_on: string | null
          publication_ref_id: number | null
          reference_id: number | null
          resolution: number | null
          source_type: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at: string
        }
        Insert: {
          attempt_number?: number | null
          bmrb_id?: string | null
          construct_id: number
          created_at?: string
          emdb_id?: string | null
          id?: never
          is_validated?: boolean
          method: Database["public"]["Enums"]["kbsi_structure_method"]
          notes?: string | null
          pdb_id?: string | null
          performed_by?: string | null
          performed_on?: string | null
          publication_ref_id?: number | null
          reference_id?: number | null
          resolution?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at?: string
        }
        Update: {
          attempt_number?: number | null
          bmrb_id?: string | null
          construct_id?: number
          created_at?: string
          emdb_id?: string | null
          id?: never
          is_validated?: boolean
          method?: Database["public"]["Enums"]["kbsi_structure_method"]
          notes?: string | null
          pdb_id?: string | null
          performed_by?: string | null
          performed_on?: string | null
          publication_ref_id?: number | null
          reference_id?: number | null
          resolution?: number | null
          source_type?: Database["public"]["Enums"]["kbsi_source_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kbsi_structure_construct_id_fkey"
            columns: ["construct_id"]
            isOneToOne: false
            referencedRelation: "kbsi_construct"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_structure_publication_ref_id_fkey"
            columns: ["publication_ref_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kbsi_structure_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "kbsi_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          sources: Json | null
          tokens_used: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          sources?: Json | null
          tokens_used?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          sources?: Json | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_bots: number
          max_documents: number
          max_messages_per_month: number
          max_storage_mb: number
          name: string
          paddle_price_id_monthly: string | null
          paddle_price_id_yearly: string | null
          price_monthly: number
          price_yearly: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json
          id: string
          is_active?: boolean
          max_bots?: number
          max_documents?: number
          max_messages_per_month?: number
          max_storage_mb?: number
          name: string
          paddle_price_id_monthly?: string | null
          paddle_price_id_yearly?: string | null
          price_monthly?: number
          price_yearly?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_bots?: number
          max_documents?: number
          max_messages_per_month?: number
          max_storage_mb?: number
          name?: string
          paddle_price_id_monthly?: string | null
          paddle_price_id_yearly?: string | null
          price_monthly?: number
          price_yearly?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      qa_pairs: {
        Row: {
          answer: string
          bot_id: string
          category: string | null
          created_at: string
          document_id: string | null
          id: string
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          bot_id: string
          category?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          bot_id?: string
          category?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_pairs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_pairs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          metadata?: Json
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          source?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          member_id: string
          owner_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          owner_id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          owner_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chat_mappings: {
        Row: {
          bot_id: string
          conversation_id: string
          created_at: string
          id: string
          language: string
          telegram_chat_id: number
          updated_at: string
        }
        Insert: {
          bot_id: string
          conversation_id: string
          created_at?: string
          id?: string
          language?: string
          telegram_chat_id: number
          updated_at?: string
        }
        Update: {
          bot_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          language?: string
          telegram_chat_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_chat_mappings_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_chat_mappings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          created_at: string
          documents_used: number
          id: string
          messages_used: number
          period_end: string
          period_start: string
          storage_used_mb: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          documents_used?: number
          id?: string
          messages_used?: number
          period_end: string
          period_start: string
          storage_used_mb?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          documents_used?: number
          id?: string
          messages_used?: number
          period_end?: string
          period_start?: string
          storage_used_mb?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_chunks: {
        Args: {
          filter_document_ids?: string[]
          filter_model?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          content: string
          document_title: string
          end_page: number
          similarity: number
          start_page: number
        }[]
      }
      match_documents: {
        Args: {
          filter_bot_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      refresh_dashboard_summary: { Args: never; Returns: undefined }
    }
    Enums: {
      kbsi_construct_type:
        | "full-length"
        | "domain"
        | "truncation"
        | "fusion"
        | "mutant"
      kbsi_crystallization_outcome:
        | "clear"
        | "precipitate"
        | "phase_separation"
        | "microcrystal"
        | "single_crystal"
        | "diffraction_quality"
      kbsi_crystallization_stage: "screening" | "optimization"
      kbsi_expression_result:
        | "no_expression"
        | "insoluble"
        | "low"
        | "moderate"
        | "high"
      kbsi_purification_result: "failed" | "low" | "acceptable" | "high"
      kbsi_review_status: "pending" | "approved" | "rejected"
      kbsi_source_type: "experimental" | "literature" | "database"
      kbsi_structure_method: "X-ray" | "NMR" | "Cryo-EM"
      kbsi_tag_position: "N-terminal" | "C-terminal"
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
      kbsi_construct_type: [
        "full-length",
        "domain",
        "truncation",
        "fusion",
        "mutant",
      ],
      kbsi_crystallization_outcome: [
        "clear",
        "precipitate",
        "phase_separation",
        "microcrystal",
        "single_crystal",
        "diffraction_quality",
      ],
      kbsi_crystallization_stage: ["screening", "optimization"],
      kbsi_expression_result: [
        "no_expression",
        "insoluble",
        "low",
        "moderate",
        "high",
      ],
      kbsi_purification_result: ["failed", "low", "acceptable", "high"],
      kbsi_review_status: ["pending", "approved", "rejected"],
      kbsi_source_type: ["experimental", "literature", "database"],
      kbsi_structure_method: ["X-ray", "NMR", "Cryo-EM"],
      kbsi_tag_position: ["N-terminal", "C-terminal"],
    },
  },
} as const
