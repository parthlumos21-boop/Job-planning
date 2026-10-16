-- ==============================================================================
-- Marketing Tasks & Effort Tracking Table
-- Fully compatible with pgAdmin Query Tool and PostgreSQL 13+
-- Zero disruption to existing tables: jobs, users, accounts, clients
-- ==============================================================================

CREATE TABLE IF NOT EXISTS marketing_tasks (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    
    -- Ownership & Assignment (Linked to Accounts / Users)
    created_by_user_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_by_name VARCHAR(255) NOT NULL,
    assigned_to_user_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    assigned_to_name VARCHAR(255) NOT NULL,
    
    -- Dates & Scheduling
    start_date DATE NOT NULL,
    target_date DATE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Effort Tracking (Separation of Estimated vs. Actual)
    estimated_effort NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    effort_unit VARCHAR(20) NOT NULL DEFAULT 'hours', -- 'hours' or 'minutes'
    actual_effort NUMERIC(8, 2) DEFAULT 0.00,
    
    -- Classification & Lifecycle
    priority VARCHAR(20) NOT NULL DEFAULT 'Normal', -- 'Low', 'Normal', 'High', 'Urgent'
    status VARCHAR(30) NOT NULL DEFAULT 'Open',     -- 'Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled'
    blocked_reason TEXT DEFAULT '',
    completion_remarks TEXT DEFAULT '',
    
    -- Readiness Check Linkage
    is_mandatory_for_readiness BOOLEAN DEFAULT FALSE,
    readiness_criterion_key VARCHAR(100) NULL,      -- e.g. 'commercial_po', 'customer_details', 'design_input'
    
    -- Attachments & Timestamps
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Data Integrity Constraints
    CONSTRAINT chk_target_after_start CHECK (target_date >= start_date),
    CONSTRAINT chk_positive_estimated_effort CHECK (estimated_effort >= 0),
    CONSTRAINT chk_positive_actual_effort CHECK (actual_effort >= 0)
);

-- Fast Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_job_id ON marketing_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_assigned_user ON marketing_tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_status ON marketing_tasks(status);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_target_date ON marketing_tasks(target_date);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_readiness ON marketing_tasks(job_id, is_mandatory_for_readiness, status);
