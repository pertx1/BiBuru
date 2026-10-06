
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_prices": {
                  Row: {
                    "created_at": string,"id": string,"input_eur_per_mtok": number,"model": string,"output_eur_per_mtok": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"input_eur_per_mtok": number,"model": string,"output_eur_per_mtok": number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"input_eur_per_mtok"?: number,"model"?: string,"output_eur_per_mtok"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_prices_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "cost_micros": number,"created_at": string,"error": string | null,"feature": string,"id": string,"input_tokens": number,"model": string,"ok": boolean,"output_tokens": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "cost_micros"?: number,"created_at"?: string,"error"?: string | null,"feature": string,"id"?: string,"input_tokens"?: number,"model": string,"ok"?: boolean,"output_tokens"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "cost_micros"?: number,"created_at"?: string,"error"?: string | null,"feature"?: string,"id"?: string,"input_tokens"?: number,"model"?: string,"ok"?: boolean,"output_tokens"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"api_tokens": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"kind": string,"token_hash": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"kind": string,"token_hash": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"token_hash"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_tokens_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "api_tokens_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "archived": boolean,"color": string,"created_at": string,"description": string | null,"icon": string,"id": string,"name": string,"production_enabled": boolean,"sort_order": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "archived"?: boolean,"color"?: string,"created_at"?: string,"description"?: string | null,"icon"?: string,"id"?: string,"name": string,"production_enabled"?: boolean,"sort_order"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "archived"?: boolean,"color"?: string,"created_at"?: string,"description"?: string | null,"icon"?: string,"id"?: string,"name"?: string,"production_enabled"?: boolean,"sort_order"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "businesses_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "action_status": string | null,"content": string,"conversation_id": string,"created_at": string,"id": string,"links": Json | null,"pending_action": Json | null,"role": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "action_status"?: string | null,"content"?: string,"conversation_id": string,"created_at"?: string,"id"?: string,"links"?: Json | null,"pending_action"?: Json | null,"role": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "action_status"?: string | null,"content"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"links"?: Json | null,"pending_action"?: Json | null,"role"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"design_dtf_rules": {
                  Row: {
                    "business_id": string,"created_at": string,"design": string,"dtf_color": string,"id": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"design": string,"dtf_color": string,"id"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"design"?: string,"dtf_color"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "design_dtf_rules_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "design_dtf_rules_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"dtf_designs": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"kind": string,"name": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"kind"?: string,"name": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dtf_designs_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "dtf_designs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"dtf_stocks": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"name": string,"quantity": number,"updated_at": string,"user_id": string,"variant": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"name": string,"quantity"?: number,"updated_at"?: string,"user_id"?: string,"variant": string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"quantity"?: number,"updated_at"?: string,"user_id"?: string,"variant"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dtf_stocks_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "dtf_stocks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"business_id": string | null,"created_at": string,"end_date": string,"end_time": string | null,"id": string,"location": string | null,"notes": string | null,"recurrence": Json | null,"start_date": string,"start_time": string | null,"title": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "all_day"?: boolean,"business_id"?: string | null,"created_at"?: string,"end_date": string,"end_time"?: string | null,"id"?: string,"location"?: string | null,"notes"?: string | null,"recurrence"?: Json | null,"start_date": string,"start_time"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "all_day"?: boolean,"business_id"?: string | null,"created_at"?: string,"end_date"?: string,"end_time"?: string | null,"id"?: string,"location"?: string | null,"notes"?: string | null,"recurrence"?: Json | null,"start_date"?: string,"start_time"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_categories": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_categories_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount_cents": number,"attachment_path": string | null,"business_id": string,"category_id": string | null,"concept": string | null,"created_at": string,"expense_date": string,"external_id": string | null,"fts": unknown,"id": string,"payment_method": string | null,"recurrence": string | null,"recurrence_end": string | null,"recurring_parent_id": string | null,"supplier": string | null,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "amount_cents": number,"attachment_path"?: string | null,"business_id": string,"category_id"?: string | null,"concept"?: string | null,"created_at"?: string,"expense_date"?: string,"external_id"?: string | null,"fts"?: never,"id"?: string,"payment_method"?: string | null,"recurrence"?: string | null,"recurrence_end"?: string | null,"recurring_parent_id"?: string | null,"supplier"?: string | null,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"attachment_path"?: string | null,"business_id"?: string,"category_id"?: string | null,"concept"?: string | null,"created_at"?: string,"expense_date"?: string,"external_id"?: string | null,"fts"?: never,"id"?: string,"payment_method"?: string | null,"recurrence"?: string | null,"recurrence_end"?: string | null,"recurring_parent_id"?: string | null,"supplier"?: string | null,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "expenses_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "expense_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_recurring_parent_id_fkey"
      columns: ["recurring_parent_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"folders": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"parent_id": string | null,"sort_order": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "folders_parent_id_workspace_id_fkey"
      columns: ["parent_id","workspace_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "folders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"goal_milestones": {
                  Row: {
                    "created_at": string,"done": boolean,"goal_id": string,"id": string,"sort_order": number,"title": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"done"?: boolean,"goal_id": string,"id"?: string,"sort_order"?: number,"title": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"done"?: boolean,"goal_id"?: string,"id"?: string,"sort_order"?: number,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_milestones_goal_id_workspace_id_fkey"
      columns: ["goal_id","workspace_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "goal_milestones_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"goal_progress": {
                  Row: {
                    "created_at": string,"goal_id": string,"id": string,"note": string | null,"recorded_on": string,"updated_at": string,"user_id": string,"value": number,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"goal_id": string,"id"?: string,"note"?: string | null,"recorded_on"?: string,"updated_at"?: string,"user_id"?: string,"value": number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"goal_id"?: string,"id"?: string,"note"?: string | null,"recorded_on"?: string,"updated_at"?: string,"user_id"?: string,"value"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_progress_goal_id_workspace_id_fkey"
      columns: ["goal_id","workspace_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "goal_progress_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "auto_source": string | null,"business_id": string | null,"completed_at": string | null,"created_at": string,"current_value": number,"deadline": string | null,"description": string | null,"id": string,"measure_type": string,"period_start": string | null,"status": string,"target_value": number,"title": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "auto_source"?: string | null,"business_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"current_value"?: number,"deadline"?: string | null,"description"?: string | null,"id"?: string,"measure_type"?: string,"period_start"?: string | null,"status"?: string,"target_value"?: number,"title": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "auto_source"?: string | null,"business_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"current_value"?: number,"deadline"?: string | null,"description"?: string | null,"id"?: string,"measure_type"?: string,"period_start"?: string | null,"status"?: string,"target_value"?: number,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "goals_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"inbox_items": {
                  Row: {
                    "ai_attempts": number,"ai_last_error": string | null,"ai_next_try_at": string | null,"captured_at": string,"client_id": string,"created_at": string,"id": string,"processed_at": string | null,"proposal": Json | null,"raw_text": string,"source": string,"status": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "ai_attempts"?: number,"ai_last_error"?: string | null,"ai_next_try_at"?: string | null,"captured_at"?: string,"client_id": string,"created_at"?: string,"id"?: string,"processed_at"?: string | null,"proposal"?: Json | null,"raw_text": string,"source"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "ai_attempts"?: number,"ai_last_error"?: string | null,"ai_next_try_at"?: string | null,"captured_at"?: string,"client_id"?: string,"created_at"?: string,"id"?: string,"processed_at"?: string | null,"proposal"?: Json | null,"raw_text"?: string,"source"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inbox_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"incomes": {
                  Row: {
                    "amount_cents": number,"business_id": string,"concept": string | null,"created_at": string,"external_id": string | null,"id": string,"income_date": string,"method": string | null,"source": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "amount_cents": number,"business_id": string,"concept"?: string | null,"created_at"?: string,"external_id"?: string | null,"id"?: string,"income_date"?: string,"method"?: string | null,"source": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"business_id"?: string,"concept"?: string | null,"created_at"?: string,"external_id"?: string | null,"id"?: string,"income_date"?: string,"method"?: string | null,"source"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incomes_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "incomes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"integrations": {
                  Row: {
                    "account_email": string | null,"created_at": string,"id": string,"last_sync_added": number,"last_sync_at": string | null,"last_sync_error": string | null,"provider": string,"refresh_token_enc": string,"scopes": string | null,"sync_likes": boolean,"sync_playlists": NonNullable<Json>,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "account_email"?: string | null,"created_at"?: string,"id"?: string,"last_sync_added"?: number,"last_sync_at"?: string | null,"last_sync_error"?: string | null,"provider": string,"refresh_token_enc": string,"scopes"?: string | null,"sync_likes"?: boolean,"sync_playlists"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "account_email"?: string | null,"created_at"?: string,"id"?: string,"last_sync_added"?: number,"last_sync_at"?: string | null,"last_sync_error"?: string | null,"provider"?: string,"refresh_token_enc"?: string,"scopes"?: string | null,"sync_likes"?: boolean,"sync_playlists"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integrations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "business_id": string,"created_at": string,"external_id": string | null,"id": string,"name": string,"updated_at": string,"url": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"external_id"?: string | null,"id"?: string,"name": string,"updated_at"?: string,"url": string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"external_id"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"url"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "invoices_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "body": string,"business_id": string | null,"created_at": string,"folder_id": string | null,"fts": unknown,"id": string,"pinned": boolean,"title": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "body"?: string,"business_id"?: string | null,"created_at"?: string,"folder_id"?: string | null,"fts"?: never,"id"?: string,"pinned"?: boolean,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "body"?: string,"business_id"?: string | null,"created_at"?: string,"folder_id"?: string | null,"fts"?: never,"id"?: string,"pinned"?: boolean,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "notes_folder_id_workspace_id_fkey"
      columns: ["folder_id","workspace_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "notes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_log": {
                  Row: {
                    "created_at": string,"dedupe_key": string,"id": string,"kind": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"dedupe_key": string,"id"?: string,"kind": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"dedupe_key"?: string,"id"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_items": {
                  Row: {
                    "color": string | null,"created_at": string,"fts": unknown,"id": string,"order_id": string,"product_id": string | null,"product_name": string,"quantity": number,"size": string | null,"unit_cost_cents": number,"unit_price_cents": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"fts"?: never,"id"?: string,"order_id": string,"product_id"?: string | null,"product_name": string,"quantity"?: number,"size"?: string | null,"unit_cost_cents"?: number,"unit_price_cents"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"fts"?: never,"id"?: string,"order_id"?: string,"product_id"?: string | null,"product_name"?: string,"quantity"?: number,"size"?: string | null,"unit_cost_cents"?: number,"unit_price_cents"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_workspace_id_fkey"
      columns: ["order_id","workspace_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "business_id": string,"channel": string | null,"cost_cents": number,"created_at": string,"customer": string | null,"external_id": string | null,"fts": unknown,"id": string,"notes": string | null,"order_date": string,"order_number": string | null,"status": string,"total_cents": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"channel"?: string | null,"cost_cents"?: number,"created_at"?: string,"customer"?: string | null,"external_id"?: string | null,"fts"?: never,"id"?: string,"notes"?: string | null,"order_date"?: string,"order_number"?: string | null,"status"?: string,"total_cents"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"channel"?: string | null,"cost_cents"?: number,"created_at"?: string,"customer"?: string | null,"external_id"?: string | null,"fts"?: never,"id"?: string,"notes"?: string | null,"order_date"?: string,"order_number"?: string | null,"status"?: string,"total_cents"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"print_bag_checks": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"key": string,"quantity": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"key": string,"quantity": number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"key"?: string,"quantity"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_bag_checks_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "print_bag_checks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"business_id": string,"cost_cents": number,"created_at": string,"id": string,"name": string,"price_cents": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"business_id": string,"cost_cents"?: number,"created_at"?: string,"id"?: string,"name": string,"price_cents"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"business_id"?: string,"cost_cents"?: number,"created_at"?: string,"id"?: string,"name"?: string,"price_cents"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "products_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "ai_alert_month": string | null,"ai_auto_apply": boolean,"ai_monthly_budget_cents": number,"created_at": string,"daily_digest_enabled": boolean,"daily_digest_time": string,"default_workspace_id": string | null,"display_name": string | null,"event_lead_minutes": number,"id": string,"overdue_alert_enabled": boolean,"overdue_alert_time": string,"quiet_hours_end": string,"quiet_hours_start": string,"task_lead_minutes": number,"timezone": string,"updated_at": string,"user_id": string,"video_long_minutes": number,"weekly_review_dow": number,"weekly_review_enabled": boolean,"weekly_review_time": string
                  }
                  Insert: {
                    "ai_alert_month"?: string | null,"ai_auto_apply"?: boolean,"ai_monthly_budget_cents"?: number,"created_at"?: string,"daily_digest_enabled"?: boolean,"daily_digest_time"?: string,"default_workspace_id"?: string | null,"display_name"?: string | null,"event_lead_minutes"?: number,"id"?: string,"overdue_alert_enabled"?: boolean,"overdue_alert_time"?: string,"quiet_hours_end"?: string,"quiet_hours_start"?: string,"task_lead_minutes"?: number,"timezone"?: string,"updated_at"?: string,"user_id": string,"video_long_minutes"?: number,"weekly_review_dow"?: number,"weekly_review_enabled"?: boolean,"weekly_review_time"?: string
                  }
                  Update: {
                    "ai_alert_month"?: string | null,"ai_auto_apply"?: boolean,"ai_monthly_budget_cents"?: number,"created_at"?: string,"daily_digest_enabled"?: boolean,"daily_digest_time"?: string,"default_workspace_id"?: string | null,"display_name"?: string | null,"event_lead_minutes"?: number,"id"?: string,"overdue_alert_enabled"?: boolean,"overdue_alert_time"?: string,"quiet_hours_end"?: string,"quiet_hours_start"?: string,"task_lead_minutes"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"video_long_minutes"?: number,"weekly_review_dow"?: number,"weekly_review_enabled"?: boolean,"weekly_review_time"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_default_workspace_id_fkey"
      columns: ["default_workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"last_success_at": string | null,"p256dh": string,"updated_at": string,"user_agent": string | null,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"last_success_at"?: string | null,"p256dh": string,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"last_success_at"?: string | null,"p256dh"?: string,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "created_at": string,"event_id": string | null,"id": string,"remind_at": string,"sent_at": string | null,"status": string,"task_id": string | null,"title": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id"?: string | null,"id"?: string,"remind_at": string,"sent_at"?: string | null,"status"?: string,"task_id"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string | null,"id"?: string,"remind_at"?: string,"sent_at"?: string | null,"status"?: string,"task_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_event_id_workspace_id_fkey"
      columns: ["event_id","workspace_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "reminders_task_id_workspace_id_fkey"
      columns: ["task_id","workspace_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "reminders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_videos": {
                  Row: {
                    "actions": NonNullable<Json>,"added_via": string,"analysis_attempts": number,"analysis_cost_micros": number,"analysis_error": string | null,"analysis_mode": string | null,"analysis_next_try_at": string | null,"analysis_status": string,"business_id": string | null,"business_reason": string | null,"category_id": string | null,"channel": string | null,"created_at": string,"duration_sec": number | null,"external_id": string | null,"fts": unknown,"id": string,"key_points": NonNullable<Json>,"notes": string | null,"origin_list": string | null,"published_at": string | null,"source": string,"status": string,"summary": string | null,"thumbnail_url": string | null,"title": string,"updated_at": string,"url": string,"user_id": string,"utility": number | null,"workspace_id": string
                  }
                  Insert: {
                    "actions"?: NonNullable<Json>,"added_via"?: string,"analysis_attempts"?: number,"analysis_cost_micros"?: number,"analysis_error"?: string | null,"analysis_mode"?: string | null,"analysis_next_try_at"?: string | null,"analysis_status"?: string,"business_id"?: string | null,"business_reason"?: string | null,"category_id"?: string | null,"channel"?: string | null,"created_at"?: string,"duration_sec"?: number | null,"external_id"?: string | null,"fts"?: never,"id"?: string,"key_points"?: NonNullable<Json>,"notes"?: string | null,"origin_list"?: string | null,"published_at"?: string | null,"source": string,"status"?: string,"summary"?: string | null,"thumbnail_url"?: string | null,"title"?: string,"updated_at"?: string,"url": string,"user_id"?: string,"utility"?: number | null,"workspace_id": string
                  }
                  Update: {
                    "actions"?: NonNullable<Json>,"added_via"?: string,"analysis_attempts"?: number,"analysis_cost_micros"?: number,"analysis_error"?: string | null,"analysis_mode"?: string | null,"analysis_next_try_at"?: string | null,"analysis_status"?: string,"business_id"?: string | null,"business_reason"?: string | null,"category_id"?: string | null,"channel"?: string | null,"created_at"?: string,"duration_sec"?: number | null,"external_id"?: string | null,"fts"?: never,"id"?: string,"key_points"?: NonNullable<Json>,"notes"?: string | null,"origin_list"?: string | null,"published_at"?: string | null,"source"?: string,"status"?: string,"summary"?: string | null,"thumbnail_url"?: string | null,"title"?: string,"updated_at"?: string,"url"?: string,"user_id"?: string,"utility"?: number | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_videos_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "saved_videos_category_id_workspace_id_fkey"
      columns: ["category_id","workspace_id"]
isOneToOne: false
      referencedRelation: "video_categories"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "saved_videos_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"shirt_dtf_rules": {
                  Row: {
                    "business_id": string,"created_at": string,"dtf_color": string,"id": string,"shirt_color": string,"shirt_color_key": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"dtf_color": string,"id"?: string,"shirt_color": string,"shirt_color_key": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"dtf_color"?: string,"id"?: string,"shirt_color"?: string,"shirt_color_key"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shirt_dtf_rules_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "shirt_dtf_rules_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"taggings": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"item_type": string,"tag_id": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"item_type": string,"tag_id": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"item_type"?: string,"tag_id"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "taggings_tag_id_workspace_id_fkey"
      columns: ["tag_id","workspace_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "taggings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "business_id": string | null,"completed_at": string | null,"created_at": string,"due_date": string | null,"due_time": string | null,"folder_id": string | null,"fts": unknown,"goal_id": string | null,"id": string,"notes": string | null,"parent_id": string | null,"priority": number,"recurrence": Json | null,"sort_order": number,"status": string,"title": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"due_time"?: string | null,"folder_id"?: string | null,"fts"?: never,"goal_id"?: string | null,"id"?: string,"notes"?: string | null,"parent_id"?: string | null,"priority"?: number,"recurrence"?: Json | null,"sort_order"?: number,"status"?: string,"title": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"due_time"?: string | null,"folder_id"?: string | null,"fts"?: never,"goal_id"?: string | null,"id"?: string,"notes"?: string | null,"parent_id"?: string | null,"priority"?: number,"recurrence"?: Json | null,"sort_order"?: number,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "tasks_folder_fk"
      columns: ["folder_id","workspace_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "tasks_goal_id_workspace_id_fkey"
      columns: ["goal_id","workspace_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "tasks_parent_id_workspace_id_fkey"
      columns: ["parent_id","workspace_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "tasks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"tshirt_stocks": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"model": string,"quantity": number,"size": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"model": string,"quantity"?: number,"size": string,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"model"?: string,"quantity"?: number,"size"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tshirt_stocks_business_id_workspace_id_fkey"
      columns: ["business_id","workspace_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "tshirt_stocks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"video_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"pinned": boolean,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"pinned"?: boolean,"updated_at"?: string,"user_id"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"pinned"?: boolean,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "video_categories_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"role"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "ai_recent_calls":
{ Args: { "seconds"?: number,"ws": string }; Returns: number
                           },
"ai_spend":
{ Args: { "p_from": string,"p_to"?: string,"ws": string }; Returns: {
              "calls": number,"cost_micros": number,"feature": string,"input_tokens": number,"output_tokens": number
            }[]
                           },
"antola_snapshot":
{ Args: { "p_hash": string }; Returns: Json
                           },
"apply_workspace_policies":
{ Args: { "tbl": string }; Returns: undefined
                           },
"configure_cron":
{ Args: { "app_url": string,"secret": string }; Returns: string
                           },
"ensure_profile":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"ensure_profile_for":
{ Args: { "uid": string }; Returns: string
                           },
"is_workspace_admin":
{ Args: { "ws": string }; Returns: boolean
                           },
"is_workspace_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"materialize_recurring_expenses":
{ Args: { "up_to"?: string,"ws": string }; Returns: number
                           },
"prefix_tsquery":
{ Args: { "q": string }; Returns: unknown
                           },
"search_all":
{ Args: { "max_rows"?: number,"q": string,"ws": string }; Returns: {
              "business_id": string,"happened_on": string,"id": string,"kind": string,"rank": number,"snippet": string,"title": string
            }[]
                           },
"seed_default_expense_categories":
{ Args: { "uid": string,"ws": string }; Returns: undefined
                           },
"stats_expenses_by_category":
{ Args: { "max_rows"?: number,"p_business"?: string,"p_from": string,"p_to": string,"ws": string }; Returns: {
              "amount_cents": number,"color": string,"label": string
            }[]
                           },
"stats_monthly":
{ Args: { "p_business"?: string,"p_from": string,"p_to": string,"ws": string }; Returns: {
              "expense_cents": number,"income_cents": number,"month": string
            }[]
                           },
"stats_top_products":
{ Args: { "group_by"?: string,"max_rows"?: number,"p_business"?: string,"p_from": string,"p_to": string,"ws": string }; Returns: {
              "label": string,"revenue_cents": number,"units": number
            }[]
                           },
"stats_totals":
{ Args: { "p_business"?: string,"p_from": string,"p_to": string,"ws": string }; Returns: {
              "business_id": string,"expense_cents": number,"income_cents": number,"orders_count": number
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
