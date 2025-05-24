export interface RecurringTask {
  $id?: string
  title: string
  description?: string
  assigned_to_user_id: string
  created_by_user_id: string
  family_id: string
  priority: "low" | "medium" | "high"
  points: number
  recurrence_type: "daily" | "weekly"
  recurrence_details?: string // e.g., "1" for Monday if weekly, or null/undefined for daily
  start_date: string // ISO Date string
  end_date?: string // ISO Date string
  is_active?: boolean
  last_generated_at?: string // ISO DateTime string
  // For UI purposes, not stored in DB directly with this name
  assigned_to_user_name?: string
}

// You might have other types here, e.g.:
// export interface Task { ... }
// export interface UserProfile { ... }
