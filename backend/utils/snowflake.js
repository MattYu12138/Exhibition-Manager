/**
 * Snowflake ID Generator
 * 64-bit: 1 sign | 41 timestamp | 10 machine | 12 sequence
 * Returns a string to avoid JS BigInt precision issues
 */

const EPOCH = 1700000000000n // custom epoch: 2023-11-14
const MACHINE_ID = 1n
const MACHINE_BITS = 10n
const SEQUENCE_BITS = 12n
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n // 4095

let lastTimestamp = -1n
let sequence = 0n

function snowflakeId() {
  let now = BigInt(Date.now())

  if (now === lastTimestamp) {
    sequence = (sequence + 1n) & MAX_SEQUENCE
    if (sequence === 0n) {
      while (now <= lastTimestamp) {
        now = BigInt(Date.now())
      }
    }
  } else {
    sequence = 0n
  }

  lastTimestamp = now

  const id =
    ((now - EPOCH) << (MACHINE_BITS + SEQUENCE_BITS)) |
    (MACHINE_ID << SEQUENCE_BITS) |
    sequence

  return id.toString()
}

/**
 * Generate exhibition ID: EX + 4-digit zero-padded sequential number
 * e.g. EX0001, EX0002, ..., EX9999
 * @param {object} db - better-sqlite3 database instance
 */
function exhibitionId(db) {
  // Find the highest existing numeric suffix among EX#### IDs
  const rows = db.prepare("SELECT id FROM exhibitions WHERE id LIKE 'EX%'").all()
  let max = 0
  for (const row of rows) {
    const num = parseInt(row.id.slice(2), 10)
    if (!isNaN(num) && num > max) max = num
  }
  const next = max + 1
  if (next > 9999) throw new Error('Exhibition ID overflow: exceeded EX9999')
  return 'EX' + String(next).padStart(4, '0')
}

/**
 * Generate user ID: U + 7-digit zero-padded sequential number
 * e.g. U0000001, U0000002, ..., U9999999
 * @param {object} db - better-sqlite3 database instance
 */
function userId(db) {
  const rows = db.prepare("SELECT id FROM users WHERE id LIKE 'U%'").all()
  let max = 0
  for (const row of rows) {
    const num = parseInt(row.id.slice(1), 10)
    if (!isNaN(num) && num > max) max = num
  }
  const next = max + 1
  if (next > 9999999) throw new Error('User ID overflow: exceeded U9999999')
  return 'U' + String(next).padStart(7, '0')
}

module.exports = { snowflakeId, exhibitionId, userId }
