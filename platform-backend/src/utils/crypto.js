/**
 * 密码对称加密工具
 * 算法：AES-256-CBC
 * 密钥派生：SHA-256(CRYPTO_SECRET + salt)
 *
 * 用途：存储用户密码的可逆加密版本，供管理员查看明文
 */

const crypto = require('crypto');

// 从环境变量读取加密主密钥，未配置时使用默认值（生产环境应配置 CRYPTO_SECRET）
const MASTER_SECRET = process.env.CRYPTO_SECRET || 'exhibition-manager-crypto-2026-default';

// 固定 salt（用于密钥派生，与主密钥一起生成 AES 密钥）
const KEY_SALT = 'exhibition-aes-key-salt-v1';

/**
 * 派生 AES-256 密钥（32 字节）
 * 使用 SHA-256(MASTER_SECRET + KEY_SALT)
 */
function deriveKey() {
  return crypto.createHash('sha256').update(MASTER_SECRET + KEY_SALT).digest(); // 32 bytes
}

/**
 * 加密明文密码
 * @param {string} plaintext 明文密码
 * @returns {string} 格式：iv_hex:ciphertext_hex
 */
function encrypt(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(16); // 随机 IV，每次加密不同
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 解密加密密码
 * @param {string} encryptedData 格式：iv_hex:ciphertext_hex
 * @returns {string} 明文密码，解密失败返回 null
 */
function decrypt(encryptedData) {
  try {
    const [ivHex, ciphertext] = encryptedData.split(':');
    if (!ivHex || !ciphertext) return null;
    const key = deriveKey();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
