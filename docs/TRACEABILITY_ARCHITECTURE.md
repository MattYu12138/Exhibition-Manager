# Product Traceability Architecture

**Author:** Manus AI  
**Status:** Implementation baseline  
**Proposed public host:** `trace.lummiincolour.com.au`

## 1. Confirmed existing data model

The project uses one shared SQLite database configured through `DB_PATH` and mounted at `/data/lic` for backend containers. Product identity comes from the canonical `products` and `product_variants` tables maintained by Inventory.

| Required display value | Existing source |
|---|---|
| Product name | `products.title` |
| Product style number | `product_variants.sku` |
| Barcode | `product_variants.gtin` |
| Variant | `product_variants.variant_title` |
| Existing product image | `product_variants.image_url` or `products.main_image` |

The first public version deliberately uses the supplied fixed image `2878.jpg`, while retaining the existing product image fields for future use.

## 2. Traceability records

`traceability_records` stores traceability details that do not currently exist in the product catalog. It links to `product_variants.id` rather than duplicating product name, SKU, Barcode, or variant data.

| Column | Purpose |
|---|---|
| `id` | Stable traceability record ID |
| `product_variant_id` | Foreign key to the canonical product variant |
| `batch_no` | Production batch displayed to the customer |
| `trace_code` | Reserved unique code for a future batch-specific QR code |
| `is_default` | Selects the current record for Barcode-only lookup |
| `fiber_composition_zh/en` | Bilingual fibre composition |
| `certification_standard` | Certification claim, initially `GOTS organic` |
| `certifying_body` | Certification body name or abbreviation |
| `licence_no` | Certified entity licence number |
| `production_origin_zh/en` | Bilingual production origin |
| `gots_verification_url` | Direct certificate URL or the official GOTS supplier database |
| `is_published` | Controls whether the public service may return the record |
| `created_by/updated_by` | Platform audit attribution |

The first version expects one default batch per product variant. The schema already permits later batch-specific records and QR lookup without changing existing product identities.

## 3. Public lookup

The public API accepts a normalized Barcode and queries `product_variants.gtin`. It joins the product table and the published default traceability record. The public response never exposes raw Shopify JSON, internal IDs not needed by the page, user information, or unpublished traceability details.

If a Barcode has no product, the result is `not_found`. If a product exists but has no published traceability record, the result is `not_published`. If duplicated Barcode data produces more than one valid result, the result is `ambiguous` and requires internal correction rather than exposing an arbitrary product.

The default GOTS verification destination is the official Certified Suppliers Database.[1]

## 4. Query analytics and privacy

`traceability_query_log` records the queried Barcode, result status, language, timestamp, referrer, user agent, and an anonymized salted visitor hash. It does not store the raw client IP address. The Platform management page presents aggregate counts and recent searches.

## 5. Access boundaries

| Capability | Access |
|---|---|
| Barcode lookup | Public, no login |
| Published traceability result | Public, no login |
| Customer support email | Public |
| Traceability record management | Platform authenticated administrator |
| Query statistics | Platform authenticated administrator |
| Generic database table access | Platform authenticated administrator |

## 6. Deployment

The traceability service follows the existing two-container pattern:

- `traceability-backend` on internal host port `3004`, sharing `/data/lic`.
- `traceability-frontend` on internal host port `8084`, proxying `/api` to the backend.
- The final public domain can be added later without code changes. `TRACEABILITY_PUBLIC_URL` and allowed origins remain environment-driven.

## References

[1]: https://global-standards.org/suppliers/certified-suppliers "GOTS Certified Suppliers Database"
