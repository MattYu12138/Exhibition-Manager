#!/usr/bin/env python3
"""Assign a user-specified *internal shipment group*, NOT a production lot.

Example (after backing up the database):
  DB_PATH=/data/lic/database/LIC_DB.db python3 assignInternalBatchLabel.py \
      --shipment-id TRADE-UNA260001 --po LIC260001 --invoice UNA260001 \
      --bill SL0202302260M --label 第一批 --actor warehouse-owner

Only private Warehouse shipment metadata changes. No stock quantities, product
batch_no, certification or public Traceability records are modified.
"""
import argparse
import os
import sqlite3


def assign(db_path, shipment_id, po, invoice, bill, label, actor):
    label = label.strip()
    actor = actor.strip()
    if not label or len(label) > 100 or not actor or len(actor) > 120:
        raise ValueError('A nonempty internal label (max 100) and actor (max 120) are required')
    if any(ord(c) < 32 for c in label + actor):
        raise ValueError('Control characters are not allowed')
    if not os.path.isfile(db_path):
        raise ValueError('Existing Warehouse SQLite database is required')
    connection = sqlite3.connect(db_path, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('BEGIN IMMEDIATE')
        shipment = connection.execute('''SELECT id, po_ref, invoice_ref, bol_ref,
            internal_batch_label, source_checksums FROM warehouse_trade_shipments WHERE id = ?''',
                                      (shipment_id,)).fetchone()
        if not shipment or (shipment['po_ref'], shipment['invoice_ref'], shipment['bol_ref']) != (po, invoice, bill):
            raise ValueError('Shipment and all three source references must match before assigning a label')
        if not shipment['source_checksums']:
            raise ValueError('Original trade-document checksums are required')
        current = shipment['internal_batch_label']
        if current == label:
            connection.commit()
            return 'unchanged'
        if current is not None:
            raise ValueError('Existing group label differs; explicit reviewed correction is required')
        updated = connection.execute('''UPDATE warehouse_trade_shipments
            SET internal_batch_label = ?, internal_batch_source_kind = 'user_instruction_provisional',
                internal_batch_recorded_by = ?, internal_batch_recorded_at = datetime('now')
            WHERE id = ? AND internal_batch_label IS NULL''', (label, actor, shipment_id))
        if updated.rowcount != 1:
            raise ValueError('Shipment group could not be updated safely')
        connection.execute('''INSERT INTO warehouse_trade_metadata_audit_log
            (shipment_id, field_name, previous_value, new_value, actor, source_kind)
            VALUES (?, 'internal_batch_label', NULL, ?, ?, 'user_instruction_provisional')''',
                           (shipment_id, label, actor))
        connection.commit()
        return 'assigned_internal_group_only'
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Privately label a documented shipment; never certify a manufacturing lot')
    parser.add_argument('--shipment-id', required=True)
    parser.add_argument('--po', required=True)
    parser.add_argument('--invoice', required=True)
    parser.add_argument('--bill', required=True)
    parser.add_argument('--label', required=True)
    parser.add_argument('--actor', required=True)
    args = parser.parse_args()
    print(assign(os.environ['DB_PATH'], args.shipment_id, args.po, args.invoice,
                 args.bill, args.label, args.actor))
