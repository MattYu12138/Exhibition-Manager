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
      // wait for next millisecond
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

module.exports = { snowflakeId }
