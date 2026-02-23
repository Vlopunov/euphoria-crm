const createSchema = async (pool) => {
  await pool.query(`
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','manager','viewer')),
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- CLIENTS
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      telegram TEXT,
      instagram TEXT,
      source TEXT CHECK(source IN ('instagram','website','telegram','relax','2gis','yandex','recommendation','other')),
      comment TEXT,
      first_contact_date DATE DEFAULT CURRENT_DATE,
      is_archived INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- LEADS
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      contact_date DATE DEFAULT CURRENT_DATE,
      desired_date TEXT,
      guest_count INTEGER,
      event_type TEXT,
      comment TEXT,
      source TEXT CHECK(source IN ('instagram','website','telegram','relax','2gis','yandex','recommendation','other')),
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','proposal_sent','waiting_response','confirmed','rejected','no_response')),
      assigned_to INTEGER REFERENCES users(id),
      booking_id INTEGER,
      is_archived INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- BOOKINGS
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      lead_id INTEGER,
      booking_date DATE NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      hours REAL NOT NULL,
      guest_count INTEGER,
      event_type TEXT,
      hourly_rate REAL NOT NULL DEFAULT 0,
      rental_cost REAL NOT NULL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'preliminary' CHECK(status IN ('preliminary','no_deposit','deposit_paid','fully_paid','completed','cancelled','rescheduled')),
      comment TEXT,
      created_by INTEGER REFERENCES users(id),
      is_archived INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- PAYMENTS
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      payment_date DATE DEFAULT CURRENT_DATE,
      amount REAL NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('deposit','additional','addons','other')),
      payment_method TEXT CHECK(payment_method IN ('cash','card_transfer','erip','bank_account')),
      comment TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- ADD-ON CATEGORIES
    CREATE TABLE IF NOT EXISTS add_on_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    );

    -- ADD-ON SERVICES
    CREATE TABLE IF NOT EXISTS add_on_services (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES add_on_categories(id),
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      executor_type TEXT CHECK(executor_type IN ('own','contractor')),
      is_active INTEGER DEFAULT 1,
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- BOOKING ADD-ONS
    CREATE TABLE IF NOT EXISTS booking_add_ons (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      service_id INTEGER NOT NULL REFERENCES add_on_services(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      sale_price REAL NOT NULL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- EXPENSE CATEGORIES
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    );

    -- EXPENSES
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      category_id INTEGER NOT NULL REFERENCES expense_categories(id),
      amount REAL NOT NULL,
      payment_method TEXT CHECK(payment_method IN ('cash','card_transfer','erip','bank_account')),
      booking_id INTEGER REFERENCES bookings(id),
      comment TEXT,
      created_by INTEGER REFERENCES users(id),
      is_archived INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- TASKS
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER REFERENCES bookings(id),
      client_id INTEGER REFERENCES clients(id),
      title TEXT NOT NULL,
      description TEXT,
      due_date DATE,
      task_type TEXT CHECK(task_type IN ('deposit_reminder','payment_reminder','addons_discuss','review_request','other')),
      is_completed INTEGER DEFAULT 0,
      assigned_to INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- GOOGLE TOKENS
    CREATE TABLE IF NOT EXISTS google_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date TEXT,
      calendar_id TEXT DEFAULT 'primary',
      google_email TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- GOOGLE CALENDAR EVENTS
    CREATE TABLE IF NOT EXISTS google_calendar_events (
      id SERIAL PRIMARY KEY,
      google_event_id TEXT NOT NULL UNIQUE,
      summary TEXT,
      description TEXT,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT NOT NULL,
      location TEXT,
      calendar_id TEXT,
      is_deleted INTEGER DEFAULT 0,
      last_synced_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- INSTAGRAM TOKENS
    CREATE TABLE IF NOT EXISTS instagram_tokens (
      id SERIAL PRIMARY KEY,
      connected_by INTEGER REFERENCES users(id),
      fb_user_id TEXT NOT NULL,
      fb_user_name TEXT,
      page_id TEXT NOT NULL,
      page_name TEXT,
      page_access_token TEXT NOT NULL,
      ig_user_id TEXT NOT NULL,
      ig_username TEXT,
      webhook_verify_token TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- INSTAGRAM CONVERSATIONS
    CREATE TABLE IF NOT EXISTS instagram_conversations (
      id SERIAL PRIMARY KEY,
      ig_sender_id TEXT NOT NULL UNIQUE,
      ig_username TEXT,
      ig_name TEXT,
      client_id INTEGER REFERENCES clients(id),
      lead_id INTEGER REFERENCES leads(id),
      last_message_at TIMESTAMP,
      unread_count INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- INSTAGRAM MESSAGES
    CREATE TABLE IF NOT EXISTS instagram_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES instagram_conversations(id),
      ig_message_id TEXT UNIQUE,
      direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing')),
      message_text TEXT,
      attachment_url TEXT,
      attachment_type TEXT,
      sent_by INTEGER REFERENCES users(id),
      ig_timestamp TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- AUDIT LOG
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- INDEXES
    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
    CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
    CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
    CREATE INDEX IF NOT EXISTS idx_google_events_dates ON google_calendar_events(start_datetime, end_datetime);
    CREATE INDEX IF NOT EXISTS idx_google_events_eid ON google_calendar_events(google_event_id);
    CREATE INDEX IF NOT EXISTS idx_ig_conversations_sender ON instagram_conversations(ig_sender_id);
    CREATE INDEX IF NOT EXISTS idx_ig_conversations_client ON instagram_conversations(client_id);
    CREATE INDEX IF NOT EXISTS idx_ig_messages_conversation ON instagram_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_ig_messages_mid ON instagram_messages(ig_message_id);
  `);
};

module.exports = { createSchema };
