ALTER TABLE order_items ADD COLUMN recipient_client_id BIGINT REFERENCES clients(id);
CREATE INDEX order_items_recipient_idx ON order_items(recipient_client_id) WHERE recipient_client_id IS NOT NULL;
ALTER TABLE client_subscriptions ADD COLUMN order_item_id UUID REFERENCES order_items(id);
CREATE UNIQUE INDEX client_subscriptions_order_item_idx ON client_subscriptions(order_item_id) WHERE order_item_id IS NOT NULL;
