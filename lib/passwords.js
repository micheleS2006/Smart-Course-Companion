const crypto = require('crypto');

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

let bcryptModule;
let bcryptLoadAttempted = false;

function getOptionalBcrypt() {
    if (!bcryptLoadAttempted) {
        bcryptLoadAttempted = true;
        try {
            bcryptModule = require('bcrypt');
        } catch (error) {
            bcryptModule = null;
        }
    }

    return bcryptModule;
}

function scryptAsync(password, salt, keyLength) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(
            password,
            salt,
            keyLength,
            { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
            (error, derivedKey) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(derivedKey);
            }
        );
    });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);

    return [
        SCRYPT_PREFIX,
        SCRYPT_N,
        SCRYPT_R,
        SCRYPT_P,
        salt,
        derivedKey.toString('hex')
    ].join('$');
}

async function verifyScryptPassword(password, storedHash) {
    const parts = String(storedHash || '').split('$');
    if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
        return false;
    }

    const [, nValue, rValue, pValue, salt, hashHex] = parts;
    const n = Number(nValue);
    const r = Number(rValue);
    const p = Number(pValue);

    if (!n || !r || !p || !salt || !hashHex) {
        return false;
    }

    const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(
            password,
            salt,
            hashHex.length / 2,
            { N: n, r, p },
            (error, key) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(key);
            }
        );
    });

    const storedBuffer = Buffer.from(hashHex, 'hex');

    if (storedBuffer.length !== derivedKey.length) {
        return false;
    }

    return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

function looksLikeBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

async function verifyPassword(password, storedHash) {
    if (!storedHash) {
        return { match: false, needsRehash: false };
    }

    if (String(storedHash).startsWith(`${SCRYPT_PREFIX}$`)) {
        const match = await verifyScryptPassword(password, storedHash);
        return { match, needsRehash: false };
    }

    if (looksLikeBcryptHash(storedHash)) {
        const bcrypt = getOptionalBcrypt();
        if (!bcrypt) {
            return { match: false, needsRehash: false, legacyHash: true };
        }

        const match = await bcrypt.compare(password, storedHash);
        return { match, needsRehash: match };
    }

    return { match: false, needsRehash: false };
}

module.exports = {
    hashPassword,
    verifyPassword
};
