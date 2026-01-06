-- Delete all completed/delivered orders to start fresh
DELETE FROM order_files WHERE order_id IN (SELECT id FROM orders WHERE status = 'delivered' OR status = 'completed');
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'delivered' OR status = 'completed');
DELETE FROM order_updates WHERE order_id IN (SELECT id FROM orders WHERE status = 'delivered' OR status = 'completed');
DELETE FROM order_update_reads WHERE order_update_id IN (SELECT id FROM order_updates WHERE order_id IN (SELECT id FROM orders WHERE status = 'delivered' OR status = 'completed'));
DELETE FROM orders WHERE status = 'delivered' OR status = 'completed';