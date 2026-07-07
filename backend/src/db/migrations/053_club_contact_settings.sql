CREATE TABLE IF NOT EXISTS club_contact_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  title TEXT NOT NULL DEFAULT 'HardZone',
  address TEXT,
  phone TEXT,
  email TEXT,
  yandex_maps_url TEXT,
  google_maps_url TEXT,
  two_gis_url TEXT,
  vk_url TEXT,
  instagram_url TEXT,
  telegram_url TEXT,
  whatsapp_url TEXT,
  max_url TEXT,
  schedule_note TEXT,
  extra_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO club_contact_settings (id, title)
VALUES (true, 'HardZone')
ON CONFLICT (id) DO NOTHING;
