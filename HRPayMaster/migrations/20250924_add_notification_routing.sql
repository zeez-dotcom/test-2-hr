CREATE TABLE IF NOT EXISTS notification_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL,
  description text,
  sla_minutes integer NOT NULL DEFAULT 60,
  delivery_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalation_strategy text NOT NULL DEFAULT 'sequential',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_escalation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES notification_routing_rules(id),
  level integer NOT NULL DEFAULT 1,
  escalate_after_minutes integer NOT NULL DEFAULT 0,
  target_role text NOT NULL,
  channel text NOT NULL,
  message_template text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_escalation_steps_rule_id_idx
  ON notification_escalation_steps(rule_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS routing_rule_id uuid REFERENCES notification_routing_rules(id),
  ADD COLUMN IF NOT EXISTS delivery_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamp,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_escalated_at timestamp,
  ADD COLUMN IF NOT EXISTS escalation_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS notifications_routing_rule_id_idx
  ON notifications(routing_rule_id);
