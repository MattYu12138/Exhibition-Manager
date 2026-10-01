#!/usr/bin/env python3
"""Private trade-document index, never certification or proof of actual warehouse receipt.

Run only after Warehouse backend has initialized its tables. This program does
not accept JSON manifests: it reopens and parses all five source files itself.
Usage: DB_PATH=/data/lic/database/LIC_DB.db python3 importTradeDocuments.py \
    ENRICHED_PO.xlsx INVOICE.xlsx PACKING.xlsx BOL.pdf ORIGINAL_PO.xlsx
Dependencies: openpyxl, pypdf (same as buildTradeManifest.py).
"""
import json
import os
import sqlite3
import sys
from datetime import date
from pathlib import Path

from buildTradeManifest import build


REQUIRED_TABLES = ('products', 'product_variants', 'warehouse_trade_shipments',
                   'warehouse_trade_shipment_lines')


def import_documents(db_path, source_paths, actor, reported_arrival_at=None):
    if len(source_paths) != 5 or any(not Path(path).is_file() for path in source_paths):
        raise ValueError('Five original source documents are required; a JSON manifest is not accepted')
    if reported_arrival_at:
        try:
            if date.fromisoformat(reported_arrival_at).isoformat() != reported_arrival_at:
                raise ValueError('Expected ISO date')
        except ValueError as exc:
            raise ValueError('A user-reported arrival date must be YYYY-MM-DD') from exc
    manifest = build(source_paths)
    if len(manifest['lines']) != 125 or manifest['declared_units'] != 12060:
        raise ValueError('Shipment quantity or SKU count disagrees with parsed originals')
    connection = sqlite3.connect(db_path, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        for table in REQUIRED_TABLES:
            if not connection.execute('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?',
                                      ('table', table)).fetchone():
                raise ValueError(f'Warehouse database has not initialized {table}')
        checksums = json.dumps(manifest['source_checksums'], separators=(',', ':'), ensure_ascii=False)
        # Serialise the conflict check, catalogue lookup and both inserts with
        # other SQLite writers; interruption leaves the entire shipment absent.
        connection.execute('BEGIN IMMEDIATE')
        existing = connection.execute('SELECT * FROM warehouse_trade_shipments WHERE id = ?',
                                      (manifest['id'],)).fetchone()
        if existing:
            if existing['source_checksums'] != checksums:
                raise ValueError('Original source documents differ from the previously indexed shipment')
            source_fields = ('intended_vessel_voyage', 'container_no', 'bol_gross_weight_kg',
                             'bol_measurement_cbm', 'delivery_term', 'packing_net_weight_kg',
                             'packing_gross_weight_kg')
            for field in source_fields:
                current = existing[field]
                actual = manifest[field]
                if current is not None and current != actual:
                    raise ValueError(f'Indexed {field} disagrees with the original bill of lading')
                if current is None:
                    connection.execute(f'UPDATE warehouse_trade_shipments SET {field} = ? WHERE id = ?',
                                       (actual, manifest['id']))
                    connection.execute('''INSERT INTO warehouse_trade_metadata_audit_log
                        (shipment_id, field_name, previous_value, new_value, actor, source_kind)
                        VALUES (?, ?, ?, ?, ?, ?)''',
                        (manifest['id'], field, None, str(actual), actor, 'original_bill_of_lading'))
            if reported_arrival_at and existing['reported_arrival_at'] != reported_arrival_at:
                connection.execute('''UPDATE warehouse_trade_shipments SET reported_arrival_at = ?,
                    arrival_reported_by = ?, arrival_reported_at = datetime('now') WHERE id = ?''',
                    (reported_arrival_at, actor, manifest['id']))
                connection.execute('''INSERT INTO warehouse_trade_metadata_audit_log
                    (shipment_id, field_name, previous_value, new_value, actor, source_kind)
                    VALUES (?, 'reported_arrival_at', ?, ?, ?, 'user_reported_unverified')''',
                    (manifest['id'], existing['reported_arrival_at'], reported_arrival_at, actor))
            connection.commit()
            return {'status': 'document_details_indexed', 'lines': 125} if any(existing[field] is None for field in source_fields) or (reported_arrival_at and existing['reported_arrival_at'] != reported_arrival_at) else {'status': 'unchanged', 'lines': 125}
        variants = connection.execute('''SELECT pv.shopify_variant_id, pv.sku, pv.gtin
            FROM product_variants pv JOIN products p ON p.id = pv.product_id
            WHERE COALESCE(p.status,'') != 'archived' ''').fetchall()
        by_sku = {}
        for variant in variants:
            key = str(variant['sku'] or '').strip().upper().replace(' - ', '-')
            by_sku.setdefault(key, []).append(variant)
        connection.execute('''INSERT INTO warehouse_trade_shipments
          (id, po_ref, invoice_ref, packing_ref, bol_ref, supplier_name, shipped_at,
           port_of_loading, port_of_discharge, declared_cartons, declared_units,
           intended_vessel_voyage, container_no, bol_gross_weight_kg, bol_measurement_cbm,
           delivery_term, packing_net_weight_kg, packing_gross_weight_kg,
           reported_arrival_at, arrival_reported_by, arrival_reported_at,
           source_checksums, imported_by, importer_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   CASE WHEN ? IS NOT NULL THEN datetime('now') END, ?, ?, ?)''',
           (manifest['id'], manifest['po_ref'], manifest['invoice_ref'], manifest['packing_ref'],
            manifest['bol_ref'], manifest['supplier_name'], manifest['shipped_at'],
            manifest['port_of_loading'], manifest['port_of_discharge'],
            manifest['declared_cartons'], manifest['declared_units'],
            manifest['intended_vessel_voyage'], manifest['container_no'],
            manifest['bol_gross_weight_kg'], manifest['bol_measurement_cbm'],
            manifest['delivery_term'], manifest['packing_net_weight_kg'],
            manifest['packing_gross_weight_kg'], reported_arrival_at,
            actor if reported_arrival_at else None,
            reported_arrival_at, checksums, actor,
            'source-verified-v1'))
        if reported_arrival_at:
            connection.execute('''INSERT INTO warehouse_trade_metadata_audit_log
                (shipment_id, field_name, previous_value, new_value, actor, source_kind)
                VALUES (?, 'reported_arrival_at', NULL, ?, ?, 'user_reported_unverified')''',
                (manifest['id'], reported_arrival_at, actor))
        exact = 0
        for index, line in enumerate(manifest['lines'], 1):
            candidates = by_sku.get(line['sku'], [])
            variant = candidates[0] if len(candidates) == 1 and str(candidates[0]['gtin'] or '').strip() == line['barcode'] else None
            connection.execute('''INSERT INTO warehouse_trade_shipment_lines
              (id, shipment_id, document_sku, document_title, document_size, barcode,
               po_quantity, invoice_quantity, packing_quantity, shopify_variant_id, match_method)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (f'{manifest["id"]}-{index:03d}', manifest['id'], line['sku'], line['title'],
               line['size'], line['barcode'], line['po_quantity'], line['invoice_quantity'],
               line['packing_quantity'], variant['shopify_variant_id'] if variant else None,
               'exact_sku' if variant else 'unmatched'))
            exact += bool(variant)
        connection.commit()
        return {'status': 'indexed_private_leads', 'lines': 125, 'catalogue_sku_candidates': exact,
                'unmatched': 125 - exact, 'certification': 'not_verified',
                'warehouse_receipt_link': 'not_established'}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Index original trade files only; never prove arrival or GOTS certification')
    parser.add_argument('files', nargs=5, help='Enriched PO, invoice, packing list, B/L, original PO')
    parser.add_argument('--reported-arrival', help='User-reported date (not an arrival certificate), YYYY-MM-DD')
    args = parser.parse_args()
    print(json.dumps(import_documents(os.environ['DB_PATH'], args.files,
                                      os.environ.get('IMPORT_ACTOR', os.environ.get('USER', 'system')),
                                      reported_arrival_at=args.reported_arrival)))
