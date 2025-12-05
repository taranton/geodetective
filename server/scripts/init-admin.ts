/**
 * Script to initialize admin user
 * Run: npx tsx scripts/init-admin.ts
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryOne, testConnection } from '../db/connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function initAdmin() {
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  // Check if admin already exists
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE username = ?',
    ['admin']
  );

  if (existing) {
    console.log('Admin user already exists');
    process.exit(0);
  }

  // Default admin credentials
  const username = 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);

  await execute(
    `INSERT INTO users (id, username, password_hash, role, credits, is_approved)
     VALUES (?, ?, ?, 'admin', 999999, TRUE)`,
    [id, username, passwordHash]
  );

  console.log('Admin user created successfully!');
  console.log(`Username: ${username}`);
  console.log(`Password: ${password}`);
  console.log('\n*** IMPORTANT: Change the password after first login! ***');

  process.exit(0);
}

initAdmin().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
