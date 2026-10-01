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
from pathlib import Path

from buildTradeManifest import build


REQUIRED_TABLES = ('products', 'product_variants', 'warehouse_trade_shipments',
                   'warehouse_trade_shipment_lines')


def import_documents(db_path, source_paths, actor):
    if len(source_paths) != 5 or any(not Path(path).is_file() for path in source_paths):
        raise ValueError('Five original source documents are required; a JSON manifest is not accepted')
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
        existing = connection.execute('SELECT source_checksums FROM warehouse_trade_shipments WHERE id = ?',
                                      (manifest['id'],)).fetchone()
        if existing:
            if existing['source_checksums'] != checksums:
                raise ValueError('Original source documents differ from the previously indexed shipment')
            connection.commit()
            return {'status': 'unchanged', 'lines': 125}
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
           source_checksums, imported_by, importer_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
           (manifest['id'], manifest['po_ref'], manifest['invoice_ref'], manifest['packing_ref'],
            manifest['bol_ref'], manifest['supplier_name'], manifest['shipped_at'],
            manifest['port_of_loading'], manifest['port_of_discharge'],
            manifest['declared_cartons'], manifest['declared_units'], checksums, actor,
            'source-verified-v1'))
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
    if len(sys.argv) != 6:
        sys.exit('Usage: importTradeDocuments.py ENRICHED_PO.xlsx INVOICE.xlsx PACKING.xlsx BOL.pdf ORIGINAL_PO.xlsx')
    print(json.dumps(import_documents(os.environ['DB_PATH'], sys.argv[1:], os.environ.get('USER', 'system'))))
