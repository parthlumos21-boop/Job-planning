-- Schema for Job Planning & Tracking Register (PostgreSQL)

-- 1. Accounts Table (User Authentication)
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    departments TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Clients Table
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    external_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Users / Engineers Catalog
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    external_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    departments TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Jobs Table (Master Register)
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    external_id INTEGER UNIQUE NOT NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    client_name VARCHAR(255),
    sr_no INTEGER,
    job_no VARCHAR(100) NOT NULL,
    panel_name VARCHAR(255) DEFAULT '',
    project_name VARCHAR(255) DEFAULT '',
    responsible_engg_name VARCHAR(255) DEFAULT '',
    po_no VARCHAR(100) DEFAULT '',
    po_date VARCHAR(50) DEFAULT '',
    delivery_period VARCHAR(100) DEFAULT '',
    delivery_date VARCHAR(50) DEFAULT '',
    data_given_to_design VARCHAR(50) DEFAULT '',
    delivery_address TEXT DEFAULT '',
    contact_person VARCHAR(255) DEFAULT '',
    type_of_industries VARCHAR(255) DEFAULT '',
    incomer_rating VARCHAR(100) DEFAULT '',
    type_of_panel VARCHAR(100) DEFAULT '',
    qty VARCHAR(50) DEFAULT '1',
    date VARCHAR(50) DEFAULT '',
    ttl VARCHAR(100) DEFAULT '',
    target_department VARCHAR(100) DEFAULT '',
    target_position VARCHAR(100) DEFAULT '',
    created_by VARCHAR(100) DEFAULT '',
    visible_to_departments TEXT[] DEFAULT '{}',
    selected BOOLEAN DEFAULT FALSE,
    
    -- Dynamic Department Fields (PostgreSQL JSONB)
    fields JSONB DEFAULT '{}'::jsonb,
    engineers JSONB DEFAULT '{}'::jsonb,
    department_status JSONB DEFAULT '{"marketing":"completed","design":"pending","mechanical":"pending","purchase":"pending","production":"pending","dispatch":"pending"}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_job_no ON jobs (job_no);
CREATE INDEX IF NOT EXISTS idx_jobs_client_name ON jobs (client_name);
CREATE INDEX IF NOT EXISTS idx_jobs_project_name ON jobs (project_name);
CREATE INDEX IF NOT EXISTS idx_jobs_fields_gin ON jobs USING gin (fields);
CREATE INDEX IF NOT EXISTS idx_jobs_engineers_gin ON jobs USING gin (engineers);

-- 5. Department Assignments
CREATE TABLE IF NOT EXISTS department_assignments (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL,
    assigned_users TEXT[] DEFAULT '{}',
    assigned_by VARCHAR(100),
    assigned_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Pending'
);

-- 6. Audit Log / Activity Trail
CREATE TABLE IF NOT EXISTS department_activities (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL,
    action VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    updated_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Dynamic Configuration
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    departments JSONB DEFAULT '[]'::jsonb,
    field_defs JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Job Execution Sessions (Live Time Tracking)
CREATE TABLE IF NOT EXISTS job_execution_sessions (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    session_type VARCHAR(20) NOT NULL, -- 'WORK' or 'PAUSE'
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER DEFAULT 0,
    performed_by VARCHAR(100) NOT NULL,
    pause_reason VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_execution_sessions_job ON job_execution_sessions (job_id, started_at);

-- 9. Job Progress History (Historical Analytics)
CREATE TABLE IF NOT EXISTS job_progress_history (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    progress_percentage NUMERIC(5,2) NOT NULL,
    active_duration_seconds INTEGER NOT NULL,
    recorded_by VARCHAR(100) NOT NULL,
    note VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_progress_history_job ON job_progress_history (job_id, recorded_at);

