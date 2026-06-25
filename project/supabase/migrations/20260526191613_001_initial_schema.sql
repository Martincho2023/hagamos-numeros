/*
  # Initial Schema for HagamosNúmeros

  1. New Tables
    - `juntadas`
      - `id` (uuid, primary key)
      - `name` (text) - Name of the gathering
      - `mode` (text) - Either 'bar' or 'casa'
      - `total` (numeric, default 0) - Total amount of the bill (for bar mode)
      - `tip_percentage` (integer, default 0) - Tip percentage (for bar mode)
      - `extra_expenses_enabled` (boolean, default false) - Toggle for extra expenses
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `participants`
      - `id` (uuid, primary key)
      - `juntada_id` (uuid, foreign key to juntadas)
      - `name` (text) - Participant name
      - `alias_bancario` (text) - Bank alias/CBU for transfers
      - `pago_efectivo` (boolean, default false) - Whether paid in cash
      - `is_recaudador` (boolean, default false) - Whether this person collected (bar mode)
      - `amount_spent` (numeric, default 0) - Amount spent (for casa mode)
      - `extra_amount` (numeric, default 0) - Extra individual expense
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for public access (simplified for this app)

  3. Indexes
    - Index on juntada_id in participants for faster queries
*/

-- Create juntadas table
CREATE TABLE IF NOT EXISTS juntadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  mode text NOT NULL CHECK (mode IN ('bar', 'casa')),
  total numeric DEFAULT 0,
  tip_percentage integer DEFAULT 0 CHECK (tip_percentage IN (0, 10, 15)),
  extra_expenses_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create participants table
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  juntada_id uuid NOT NULL REFERENCES juntadas(id) ON DELETE CASCADE,
  name text NOT NULL,
  alias_bancario text DEFAULT '',
  pago_efectivo boolean DEFAULT false,
  is_recaudador boolean DEFAULT false,
  amount_spent numeric DEFAULT 0,
  extra_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE juntadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (simplified for this demo app)
CREATE POLICY "Public read access on juntadas"
  ON juntadas FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public write access on juntadas"
  ON juntadas FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read access on participants"
  ON participants FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public write access on participants"
  ON participants FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_participants_juntada_id ON participants(juntada_id);

-- Create updated_at trigger for juntadas
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_juntadas_updated_at
  BEFORE UPDATE ON juntadas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();